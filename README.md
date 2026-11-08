# Vaie: learn in your own language

Vaie is a one-day hackathon demo for a village-education project. It has two parts:

- **`app/`**: an Android app (Expo + React Native + Expo Router) that runs in **Expo Go** on a real phone.
  - **Students (Classes 8–12, CBSE):** a learning map with streaks, XP, levels, quizzes, a mastery gate, badges, stats and leaderboards.
  - **Adult learners:** "Ask Vaie", a voice-first assistant for practical skills (farming, fixing, plumbing, building, wiring, crafts, food), plus a Translate tool.
  - The whole app is live-translated into 11 Indian languages and works by voice.
- **`server/`**: a small "town hall" server (Node + Express + SQLite) that runs on your laptop. It stores profiles, progress and leaderboards, caches translations and audio, and makes **all** AI calls (Gemini + Sarvam). API keys never go to the phone.

```
phone (Expo Go)  ──Wi-Fi──▶  laptop: server (port 4000)  ──internet──▶  Sarvam AI (translate, voice)
                                                         └──────────▶  Google Gemini (intents, assistant, photo text)
```

---

## 1. One-time setup

### What you need
- A laptop with **Node.js 20 or newer** (`node -v`). Get it from https://nodejs.org.
- An **Android phone** with the **Expo Go** app from the Play Store.
- The laptop and phone on the **same Wi-Fi network**.
- API keys (both have free tiers):
  - **Gemini:** https://aistudio.google.com/apikey
  - **Sarvam AI:** https://dashboard.sarvam.ai
- Optional: **ffmpeg** (`sudo apt install ffmpeg`, `brew install ffmpeg`, or `winget install ffmpeg`). It is only used as a fallback if Sarvam ever rejects the phone's audio format (see "How voice works").

### Install
From the project folder (the one containing this README):

```bash
npm run setup          # installs server/ and app/ dependencies
```

(`app/.npmrc` sets `legacy-peer-deps=true` because of a harmless React peer-version warning in Expo SDK 58.)

### Add your keys
```bash
cp server/.env.example server/.env      # Windows: copy server\.env.example server\.env
```
Open `server/.env` and fill in:
```
GEMINI_API_KEY=your-gemini-key
SARVAM_API_KEY=your-sarvam-key
GEMINI_MODEL=gemini-flash-latest
```
`gemini-flash-latest` always points at Google's current Flash model. If you pin a model name that Google later retires, the server logs a warning and falls back to `gemini-flash-latest` automatically.

---

## 2. Run it (two terminals)

**Terminal 1: the server**
```bash
npm run dev
```
On first start it loads the lessons into SQLite automatically. You'll see something like:
```
  🏡 Vaie town hall server is running
  Phone URL:  http://192.168.1.23:4000
  Gemini key: ✅   Sarvam key: ✅
  Lessons loaded: 36
```
The **Phone URL** is your laptop's address on the Wi-Fi. The server also writes it into `app/.env` (as `EXPO_PUBLIC_SERVER_URL`) so the app finds it automatically.

> **Finding your IP by hand** (if you need it): Windows: `ipconfig` → "IPv4 Address" of your Wi-Fi adapter. macOS: `ipconfig getifaddr en0`. Linux: `hostname -I`. Use `http://<that-ip>:4000`.

**Terminal 2: the app**
```bash
npm run app
```
A QR code appears. Open **Expo Go** on the phone → **Scan QR code** → scan it. The first load takes about a minute.

If you change `app/.env` (for example, a new IP), stop the app with Ctrl+C and run `npm run app` again. Or change the address inside the app: **Me → Settings → Server address**, or on the "Can't reach Vaie town hall server" screen.

---

## 3. Troubleshooting

| Problem | Fix |
|---|---|
| **"Can't reach Vaie town hall server"** in the app | 1) Is `npm run dev` still running? 2) On the **phone's browser**, open `http://<laptop-ip>:4000/api/health`. If that fails, it's a network or firewall problem, not the app. 3) Check the address in the app matches the "Phone URL" the server printed. |
| Phone and laptop on "the same Wi-Fi" but still nothing | Many school, office and public networks block devices from talking to each other ("client isolation"). Use a **phone hotspot**: connect the laptop to the phone's hotspot, restart `npm run dev`, and use the new IP it prints. |
| **Firewall** | Windows: allow Node.js on **Private** networks when prompted, or Windows Security → Firewall → "Allow an app" → Node.js. Make sure the Wi-Fi is set to *Private*, not *Public*. macOS: System Settings → Network → Firewall → allow `node`. Linux (ufw): `sudo ufw allow 4000/tcp` (and `8081/tcp` for Expo). |
| Expo Go can't load the app (QR scan hangs) | Same network or firewall issue for port 8081. As a workaround run `npm run app:tunnel`. The tunnel only covers the app bundle; the phone still needs to reach the server on your LAN. |
| **Cleartext HTTP** (`http://`, not `https://`) | Expo Go already allows plain HTTP to your LAN, since it loads the app itself that way, so no change is needed. A standalone APK built later would need `usesCleartextTraffic` (for example via `expo-build-properties`) or HTTPS. |
| Text stays in English | The Sarvam key is missing or invalid, or the laptop is offline. The server terminal shows `[sarvam] … 403` for a bad key. The app falls back to English instead of crashing. |
| No sound | Phone volume and media volume. TTS failures fall back to text-only. |
| Mic does nothing | Allow microphone permission for Expo Go (Android Settings → Apps → Expo Go → Permissions). |
| Reset all demo data | Stop the server, delete `server/vaie.db*`, start again (lessons and demo peers re-seed automatically). `npm run seed` reloads lessons and peers but keeps real profiles. |

---

## 4. Demo script (about 2 minutes)

**Before the demo:** start the server and the app, and do one quick run-through in Hindi so translations and audio are cached (repeat views are then instant, even on slow internet). Delete `server/vaie.db*` afterwards if you want a clean leaderboard. Translations and audio stay cached in `server/cache` and the phone.

1. **Language:** pick **हिन्दी** (tap the 🔊 next to it to hear it).
2. **Student:** choose *Student* → type a name, pick an animal, class **9** → *Start*.
3. **Science:** on the Learn map tap **Science**. The first node, *Everything is made of matter*, pulses gold.
4. **Read with audio:** open it → tap **Listen to the lesson** (Hindi voice). Scroll to the **Key idea**.
5. **Quiz, fail once:** tap **Check understanding**. Answer 2 or more wrong on purpose (you can also *say* "B"). You'll see:
   - "You need 4 out of 5 to unlock the next part"
   - each wrong answer with the right answer and an explanation
   - **Explain it differently:** Gemini re-explains with a village example, read aloud in Hindi.
6. **Pass:** tap **Try again with new questions** (a fresh draw of 5), and answer correctly. Confetti, haptics, **+XP**, the **streak flame**, *Unlocked: Solid, liquid and gas*, and new badges appear.
7. **Leaderboard:** the **Leaders** tab shows the podium, your highlighted rank against seeded classmates, and filters for My class, My village and Subject. It refreshes every 5 seconds.
8. **Stats:** XP, level, streak, accuracy per subject, a 7-day XP chart, badges and quiz history.
9. **Switch to an adult:** **Me → Switch profile → New profile → Adult learner**.
10. **Voice plumbing question:** tap the big mic and say, in Hindi: *"नल से पानी टपक रहा है, कैसे ठीक करूँ?"* (my tap is dripping, how do I fix it?). You get a short numbered answer tagged **Plumbing**, played aloud.
11. **Medical question:** ask *"मुझे तीन दिन से बुखार है, कौन सी दवा लूँ?"* (I've had a fever for three days, which medicine should I take?). Vaie gives no advice and shows the **Where to get help** card (PHC, ASHA worker, 108) with a **Call** button.
12. **Translate a photo:** **Translate** tab → **Take photo** of English text (a medicine strip or a sign). The text appears large in Hindi with a read-aloud button.

Floating-mic voice commands to try anywhere: "show my stats", "leaderboard dikhao" (show the leaderboard), "open maths", "read this", "change language to Tamil", "start the quiz".

---

## 5. What is real, and what is simulated

**Real:**
- Live translation of all UI and content via Sarvam (`mayura:v1`), with batching and caching on the server (SQLite) and the phone (AsyncStorage).
- Text-to-speech (Sarvam `bulbul:v3`, cached on disk) and speech-to-text (Sarvam `saaras:v4`).
- Voice intents and the assistant via Gemini structured output.
- Photo text extraction via Gemini vision.
- XP, levels, streaks with freezes, badges, the mastery gate and leaderboards, all stored on the server.

**Simulated or placeholder:**
- **Accounts:** no passwords. Profiles are just a name and avatar stored on the laptop.
- **Leaderboard peers:** 15 fake students (`server/seed/peers.json`, flagged `is_demo_seed` in the DB and `isDemoSeed` in the API). They get fresh random XP each week so the board looks alive.
- **Curriculum:** demo-grade, original explanations, labelled **"CBSE-aligned (demo)"**. It covers Classes 8, 9 and 10 in Science and Maths, with 2 chapters × 3 units each and 8 questions per unit (36 units, 288 questions). Classes 11–12 show "Coming soon". It is not reviewed by teachers and not copied from NCERT.
- **Helpline numbers:** in `app/src/config/resources.ts`, each marked `TODO verify`. **Check every number against an official source before the demo.**
- **Mascot and app icon:** placeholders (an owl icon and the default Expo icon). The wordmark is drawn in code.
- **System-wide translation of other apps is out of scope.** It would need a native Android accessibility service, which Expo Go cannot run. The in-app **Translate** tool (type, speak, paste or photo) is the demo substitute.

Out of scope: offline downloads, a village content database/RAG, video, real auth, iOS, an admin dashboard.

---

## 6. How it works (for developers)

### Language layer
- `app/src/i18n/strings.ts` is the **only hand-written dictionary (English)**. Every other language, Hindi included, is translated at runtime.
- `<T>English</T>` / `useTr()` (in `app/src/i18n/T.tsx`) wrap **all** visible text: UI, lessons, quiz questions and options, explanations, assistant replies, leaderboard names.
- `app/src/i18n/engine.ts` queues missing strings, sends them in batches every 40 ms to `POST /api/translate`, shows a soft shimmer while loading, falls back to English on failure (retrying after 30 s), and persists the cache per language.
- The server caches by `hash(source + target + text)` in SQLite. Long texts are split into chunks of 900 characters or fewer (Sarvam's limit is 1000).
- **Languages:** all 11 (en, hi, mr, ta, te, bn, kn, ml, gu, pa, or) are supported by Sarvam for translation, TTS (`bulbul:v3`) and STT (verified in Sarvam docs, Nov 2026). Note: the newer `bulbul:v4-flash` lacks Malayalam and Odia, which is why Vaie uses v3. Odia is `od-IN` in Sarvam. If a language ever loses voice support, set `voice: false` in `app/src/i18n/languages.ts` and the speaker buttons hide gracefully.

### How voice works
- One shared recorder (expo-audio) records **16 kHz mono AAC `.m4a`**, which Sarvam STT accepts directly. If Sarvam rejects a file, the server converts it with **ffmpeg** to 16 kHz mono WAV and retries. Without ffmpeg it retries with the other model.
- Floating mic → `/api/stt` → `/api/ai/intent` (Gemini structured output with intents such as `open_subject`, `open_lesson`, `start_quiz`, `show_leaderboard`, `show_stats`, `show_streak`, `read_aloud`, `change_language`, `open_translate`, `ask_assistant`, `answer_option`). Routing happens first. Questions go to the assistant second. Each action is confirmed by voice in the user's language. If Gemini is down, a keyword fallback still handles basic navigation.
- Quiz answers like "A / B / बी" are matched locally with no AI round-trip.
- Each screen header has a 🔊 button that reads that screen's key content.

### Ask Vaie guardrails (`server/src/ai.ts`)
- Gemini returns `{category, topic, language_detected, reply, suggestions}`. `category` is one of `in_scope | legal | financial | health | mental_health | emergency | off_topic`.
- Only `in_scope` gets advice: at most 80 words, numbered steps, and a "Safety:" line for electrical, building, chemical and machinery topics.
- Legal, financial, health and mental-health questions get a kind redirect plus the **Where to get help** card. Emergency and self-harm messages get compassionate priority messaging (112, 108, Tele-MANAS).
- If Gemini is unreachable, a keyword safety net still returns the emergency card for emergency or self-harm messages.

### Game rules (`server/src/game.ts`)
- **Unit quiz:** 5 of 8 questions drawn at random, options shuffled. Pass mark **80% (4/5)** to unlock the next unit.
- **Chapter test:** 10 questions drawn across the chapter's units. Pass mark **70%** to unlock the next chapter.
- **XP:** 10 per correct answer, +20 for passing on the first try, +15 for a perfect score, +50 for passing a chapter test.
- **Levels:** level *n* starts at 50·n·(n−1) XP (100, 300, 600, 1000, …).
- **Stars:** 3 for a perfect score, 2 for a first-try pass, 1 for a pass after retrying.
- **Streaks:** a day counts when you finish any quiz. Days follow the **server's local time** (see `server/src/time.ts`). You earn one streak freeze per 250 XP (up to 2), and a freeze is used automatically to cover a single missed day.
- **Badges:** First Unit, 3-Day Streak, Perfect Score, Chapter Master, Night Owl (after 9 pm), Never Give Up, Rising Star (500 XP).

### Reliability
- Every upstream call has a 20 s timeout (30–60 s for photos and long audio) plus concurrency limits.
- Per-phone rate limits: 40 AI calls/min and 400 translation or audio calls/min.
- The app never crashes on an API failure. It shows friendly visual and spoken errors with retry buttons. If TTS fails it shows text only. If translation fails it shows English.

### Project layout
```
server/
  src/index.ts      routes + LAN URL banner (+ writes app/.env)
  src/sarvam.ts     translate / TTS / STT wrappers + caching
  src/gemini.ts     Gemini JSON client (+ model fallback)
  src/ai.ts         intents, assistant guardrails, explain-differently, photo OCR
  src/game.ts       path/unlocks, quizzes, XP, streaks, badges, stats, leaderboard
  src/db.ts         SQLite schema     src/seed.ts   loads seed/ into SQLite
  seed/content/*.json   curriculum    seed/peers.json  demo leaderboard peers
app/
  src/app/          Expo Router routes (onboarding/, student/ tabs, adult/ tabs, unit/[id], quiz, streak, settings, translate)
  src/screens/      shared tab screens (Learn, Leaderboard, Stats, Ask, Translate, Me)
  src/i18n/         English dictionary, translation engine, <T>
  src/voice/        speaker (TTS playback), VoiceProvider (mic + intents)
  src/config/resources.ts   help-line resources (VERIFY before demo)
```

**API (all JSON):** `GET /api/health`, `POST /api/profiles`, `GET /api/path`, `GET /api/quiz`, `POST /api/quiz/submit`, `GET /api/stats`, `GET /api/leaderboard`, `POST /api/translate`, `POST /api/translate/free`, `POST /api/tts`, `POST /api/stt` (multipart), `POST /api/ai/intent`, `POST /api/ai/assistant`, `POST /api/ai/explain`, `POST /api/ai/ocr`.

Run `npm run typecheck` to type-check both projects.
