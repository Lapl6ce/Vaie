import { db } from './db.ts';
import { geminiJSON } from './gemini.ts';
import { translateFree } from './sarvam.ts';
import { HttpError } from './util.ts';

const LANG_NAMES: Record<string, string> = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', bn: 'Bengali',
  kn: 'Kannada', ml: 'Malayalam', gu: 'Gujarati', pa: 'Punjabi', or: 'Odia',
};

// ------------------------------------------------------------------ voice intents

export const INTENTS = [
  'open_subject', 'open_lesson', 'start_quiz', 'show_leaderboard', 'show_stats', 'show_streak',
  'read_aloud', 'change_language', 'open_translate', 'ask_assistant', 'answer_option', 'go_home',
  'open_settings', 'unknown',
] as const;

type Intent = {
  intent: (typeof INTENTS)[number];
  subject?: string;
  unit_id?: string;
  language_code?: string;
  option?: string;
  text?: string;
  confirmation: string;
};

/** Keyword fallback used if Gemini is unavailable, so basic voice navigation still works. */
function localIntent(text: string, screen: string): Intent | null {
  const t = text.toLowerCase().trim();
  if (screen === 'quiz') {
    const m = t.match(/^(?:option\s*)?([abcd])\b|^(एक|दो|तीन|चार|1|2|3|4)$/);
    if (m) {
      const map: Record<string, string> = { 'एक': 'A', 'दो': 'B', 'तीन': 'C', 'चार': 'D', '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
      return { intent: 'answer_option', option: (map[m[2]] ?? m[1]).toUpperCase(), confirmation: 'Answer selected' };
    }
  }
  const rules: [RegExp, Intent['intent'], string][] = [
    [/leader|rank|लीडर|रैंक/, 'show_leaderboard', 'Opening the leaderboard'],
    [/stat|progress|आँकड़े|प्रगति/, 'show_stats', 'Opening your stats'],
    [/streak|flame|स्ट्रीक/, 'show_streak', 'Here is your streak'],
    [/translat|अनुवाद/, 'open_translate', 'Opening translate'],
    [/quiz|test|क्विज़|परीक्षा/, 'start_quiz', 'Starting the quiz'],
    [/read|listen|सुनाओ|पढ़ो/, 'read_aloud', 'Reading aloud'],
    [/science|विज्ञान/, 'open_subject', 'Opening Science'],
    [/math|गणित/, 'open_subject', 'Opening Mathematics'],
    [/setting|सेटिंग/, 'open_settings', 'Opening settings'],
    [/home|घर|होम/, 'go_home', 'Going home'],
  ];
  for (const [re, intent, confirmation] of rules) {
    if (re.test(t)) {
      return {
        intent,
        confirmation,
        subject: intent === 'open_subject' ? (/math|गणित/.test(t) ? 'Mathematics' : 'Science') : undefined,
      };
    }
  }
  return null;
}

export async function detectIntent(body: {
  text: string;
  lang: string;
  screen: string;
  mode: string;
  units?: { id: string; title: string }[];
}): Promise<Intent> {
  const text = String(body.text || '').slice(0, 500);
  if (!text.trim()) return { intent: 'unknown', confirmation: "Sorry, I didn't hear anything" };
  const system = `You route voice commands for "Vaie", a learning app for village students and adults in India.
The user may speak any Indian language, English, or a mix. Pick exactly ONE intent.
Intents:
- open_subject(subject: "Science" | "Mathematics")
- open_lesson(unit_id: pick from the provided unit list by meaning)
- start_quiz(): start / take the quiz or test for the current lesson
- show_leaderboard(), show_stats(), show_streak()
- read_aloud(): read this screen / repeat / speak
- change_language(language_code: one of en,hi,mr,ta,te,bn,kn,ml,gu,pa,or)
- open_translate(): user wants to translate something
- answer_option(option: "A"|"B"|"C"|"D"): ONLY on the quiz screen, when the user says a letter, a number 1-4 (first/second...), or the words of an option
- go_home(), open_settings()
- ask_assistant(text): ANY question or request for knowledge/help (how to fix a pump, what is photosynthesis...). Put the user's question in "text" exactly as spoken.
- unknown: noise or meaningless.
Routing first: navigation intents win over ask_assistant when the user clearly wants to go somewhere.
"confirmation": a very short, friendly English sentence (max 8 words) confirming the action, e.g. "Opening your stats".`;
  const ctx = {
    utterance: text,
    app_language: LANG_NAMES[body.lang] ?? body.lang,
    current_screen: body.screen,
    user_mode: body.mode,
    units: (body.units ?? []).slice(0, 40),
  };
  try {
    return await geminiJSON<Intent>({
      system,
      parts: [{ text: JSON.stringify(ctx) }],
      temperature: 0,
      timeoutMs: 12_000,
      schema: {
        type: 'OBJECT',
        properties: {
          intent: { type: 'STRING', enum: [...INTENTS] },
          subject: { type: 'STRING', enum: ['Science', 'Mathematics'] },
          unit_id: { type: 'STRING' },
          language_code: { type: 'STRING', enum: Object.keys(LANG_NAMES) },
          option: { type: 'STRING', enum: ['A', 'B', 'C', 'D'] },
          text: { type: 'STRING' },
          confirmation: { type: 'STRING' },
        },
        required: ['intent', 'confirmation'],
      },
    });
  } catch (e) {
    const local = localIntent(text, body.screen);
    if (local) return local;
    // Treat anything unmatched as a question for the assistant.
    if (e instanceof HttpError && e.code === 'no_key') throw e;
    return { intent: 'ask_assistant', text, confirmation: 'Let me find an answer' };
  }
}

// ------------------------------------------------------------------ Ask Vaie assistant

export const CATEGORIES = ['in_scope', 'legal', 'financial', 'health', 'mental_health', 'emergency', 'off_topic'] as const;
export const TOPICS = ['Farming', 'Fixing', 'Plumbing', 'Building', 'Wiring', 'Crafts', 'Food', 'Everyday life', 'Science', 'Mathematics', 'None'] as const;

type AssistantOut = {
  category: (typeof CATEGORIES)[number];
  topic: (typeof TOPICS)[number];
  language_detected: string;
  reply: string;
  suggestions: string[];
};

const ASSISTANT_SYSTEM = `You are "Vaie", a warm, patient helper for villagers in India, many with low literacy.
You ONLY teach PRACTICAL skills: everyday life skills, farming, mechanics and fixing things, artisan crafts and trades,
general healthy-eating knowledge, plumbing, construction, and electrical installation & wiring SAFETY. You may also
explain school Science and Maths simply (topic "Science"/"Mathematics") for students.

Classify every message into exactly one category:
- in_scope: one of the skills above. Answer it.
- legal: laws, police, land disputes, documents' legal meaning, rights, court.
- financial: money advice, loans, investments, insurance, banking decisions, schemes payouts, anything monetary.
- health: symptoms, illness, medicines, injuries (non-emergency), diet FOR A DISEASE, supplements, pregnancy, infant feeding.
- mental_health: stress, sadness, loneliness, anxiety, sleep problems from worry.
- emergency: danger now — fire, electric shock happening, severe bleeding, poisoning, someone unconscious, violence,
  OR any sign of self-harm / suicide / wanting to die. Self-harm is ALWAYS emergency.
- off_topic: anything else (politics, celebrities, coding, homework essays, gossip...).

Nutrition boundary: general food knowledge (balanced plate, cheap protein, washing vegetables) is in_scope.
Disease diets, supplements, medication, pregnancy or baby feeding concerns -> health.

Reply rules (write "reply" in simple ENGLISH; it will be translated for the user):
- in_scope: at most 80 words. Very simple words. Give 3-5 short numbered steps ("1. ... 2. ...") when there is a task.
  ALWAYS add a one-line safety warning starting with "Safety:" for electrical, construction, chemicals/pesticides,
  heights, tools or machinery. For any electrical work: tell them to switch off the main supply first, and to call
  a licensed electrician for anything beyond simple tasks.
- legal / financial / health / mental_health: DO NOT give advice, steps, doses, or opinions. In 1-3 kind sentences, say
  this needs a trusted professional or official source and that the card below shows where to get help.
  For financial, also warn gently that scammers are common and never to share OTP/PIN.
- emergency: calm, caring, short. First line: get help now (the card shows the number). For self-harm: say you care,
  they are not alone, and urge them to call now or to tell someone nearby. Never sound like a refusal.
- off_topic: politely say Vaie helps with farming, fixing, plumbing, building, wiring, crafts and food, and give one example question.
"topic": the matching topic for in_scope, otherwise "None".
"language_detected": the language the user wrote/spoke in (English name).
"suggestions": 2-3 short follow-up questions (max 8 words each, English) the user might ask next, within scope.`;

const EMERGENCY_RE =
  /suicid|kill myself|want to die|end my life|आत्महत्या|मरना चाहत|मर जाना|खुद को मार|fire|आग|bleeding|खून बह|poison|ज़हर|जहर|shock|करंट|unconscious|बेहोश/i;

export async function assistant(body: { text: string; lang: string; history?: { role: string; text: string }[] }) {
  const text = String(body.text || '').slice(0, 1500);
  if (!text.trim()) throw new HttpError(400, 'Empty message');
  const history = (body.history ?? []).slice(-6).map((h) => `${h.role === 'user' ? 'User' : 'Vaie'}: ${String(h.text).slice(0, 400)}`);
  try {
    const out = await geminiJSON<AssistantOut>({
      system: ASSISTANT_SYSTEM,
      parts: [{ text: (history.length ? `Conversation so far:\n${history.join('\n')}\n\n` : '') + `New message: ${text}` }],
      temperature: 0.4,
      schema: {
        type: 'OBJECT',
        properties: {
          category: { type: 'STRING', enum: [...CATEGORIES] },
          topic: { type: 'STRING', enum: [...TOPICS] },
          language_detected: { type: 'STRING' },
          reply: { type: 'STRING' },
          suggestions: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['category', 'topic', 'language_detected', 'reply', 'suggestions'],
      },
    });
    if (!CATEGORIES.includes(out.category)) out.category = 'off_topic';
    return out;
  } catch (e) {
    // Safety backstop: even with the AI down, emergencies get the right card.
    if (EMERGENCY_RE.test(text)) {
      return {
        category: 'emergency',
        topic: 'None',
        language_detected: 'unknown',
        reply: 'Please get help right now. Call the emergency number below, or ask someone near you to help. You are not alone.',
        suggestions: [],
      } satisfies AssistantOut;
    }
    throw e;
  }
}

// ------------------------------------------------------------------ explain differently

export async function explainDifferently(unitId: string, wrong: string[]) {
  const u = db.prepare('SELECT title, body, key_idea FROM units WHERE id = ?').get(unitId) as
    | { title: string; body: string; key_idea: string }
    | undefined;
  if (!u) throw new HttpError(404, 'Unit not found');
  return geminiJSON<{ explanation: string; example: string }>({
    system: `You are a kind village tutor for CBSE students aged 13-18 with weak reading skills.
Re-explain the key idea of a lesson in DIFFERENT, much SIMPLER words. Use a concrete Indian village example
(farm, well, cows, cooking on a chulha, market, bicycle, monsoon...). Write in simple English (it will be translated).
"explanation": max 70 words, short sentences. "example": one vivid village example sentence (max 30 words).`,
    parts: [
      {
        text: JSON.stringify({
          lesson_title: u.title,
          key_idea: u.key_idea,
          lesson: u.body,
          questions_the_student_got_wrong: wrong.slice(0, 5),
        }),
      },
    ],
    temperature: 0.7,
    schema: {
      type: 'OBJECT',
      properties: { explanation: { type: 'STRING' }, example: { type: 'STRING' } },
      required: ['explanation', 'example'],
    },
  });
}

// ------------------------------------------------------------------ photo -> text -> translation

export async function ocrTranslate(imageBase64: string, mime: string, target: string) {
  if (!imageBase64) throw new HttpError(400, 'No image');
  const out = await geminiJSON<{ has_text: boolean; text: string; kind: string }>({
    system: `Extract ALL printed or written text from the photo exactly as written, keeping line breaks.
Do not translate. Do not explain. If there is no readable text, set has_text=false and text="".
kind: what the photo shows (sign, medicine label, form, app screenshot, document, other).`,
    parts: [{ inline_data: { mime_type: mime || 'image/jpeg', data: imageBase64 } }, { text: 'Extract the text.' }],
    temperature: 0,
    timeoutMs: 30_000,
    schema: {
      type: 'OBJECT',
      properties: { has_text: { type: 'BOOLEAN' }, text: { type: 'STRING' }, kind: { type: 'STRING' } },
      required: ['has_text', 'text', 'kind'],
    },
  });
  if (!out.has_text || !out.text.trim()) return { extracted: '', translated: '', kind: out.kind, detected: null };
  const tr = await translateFree(out.text.slice(0, 4000), target);
  return { extracted: out.text, translated: tr.text, kind: out.kind, detected: tr.detected ?? null };
}
