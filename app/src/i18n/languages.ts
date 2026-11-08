/**
 * Languages Vaie supports. Verified against Sarvam docs (2026-11): all 11 work for
 * translation (mayura:v1), text-to-speech (bulbul:v3) and speech-to-text (saaras).
 * `voice: false` would hide audio buttons gracefully if a language ever loses voice support.
 */
export type Lang = { code: string; native: string; english: string; voice: boolean };

export const LANGUAGES: Lang[] = [
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', voice: true },
  { code: 'en', native: 'English', english: 'English', voice: true },
  { code: 'mr', native: 'मराठी', english: 'Marathi', voice: true },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil', voice: true },
  { code: 'te', native: 'తెలుగు', english: 'Telugu', voice: true },
  { code: 'bn', native: 'বাংলা', english: 'Bengali', voice: true },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada', voice: true },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam', voice: true },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati', voice: true },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi', voice: true },
  { code: 'or', native: 'ଓଡ଼ିଆ', english: 'Odia', voice: true },
];

export const langByCode = (code: string) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[1];
export const hasVoice = (code: string) => langByCode(code).voice;
