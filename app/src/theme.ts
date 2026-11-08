/**
 * Palette taken from Latent (trylatent.co, site.css design tokens):
 *   --bg #0E0D0C  --surface #181614  --control #22201D  --border rgba(255,255,255,.08)
 *   --paper #F7F3EA  --text-2 #B5B0A7  --text-3 #6E6A64
 *   --accent #E8C95F  --on-accent #1A1508  --recording #F2555A
 * Warm near-black, paper-white text, one gold accent, one red. No purple.
 *
 * Key names are kept from the original theme so every screen picks this up:
 *   `green`  = the primary accent (now Latent gold). `success` = right-answer green.
 *   `xLight` = a quiet tinted surface;  `xDark` = the readable bright tone of that accent.
 * Body text >= 18sp, touch targets >= 56dp.
 */
export const C = {
  bg: '#0E0D0C',
  card: '#181614',
  raised: '#22201D',
  green: '#E8C95F',
  greenDark: '#F0D98A',
  greenLight: '#262115',
  success: '#8CC084',
  successLight: '#18231A',
  terracotta: '#F2555A',
  terracottaLight: '#2B1617',
  gold: '#E8C95F',
  goldDark: '#F0D98A',
  goldLight: '#262115',
  text: '#F7F3EA',
  muted: '#B5B0A7',
  faint: '#6E6A64',
  border: '#272523',
  locked: '#35322E',
  danger: '#F2555A',
  dangerLight: '#2B1617',
  blue: '#8FB3CF',
  blueLight: '#172028',
  white: '#FFFFFF',
  onAccent: '#1A1508',
};

/** Readable text/icon colour on top of a filled background (dark ink on light fills like gold). */
export function onColor(bg: string): string {
  const m = /^#([0-9a-f]{6})/i.exec(bg);
  if (!m) return C.white;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? C.onAccent : C.white;
}

export const S = {
  body: 18,
  large: 22,
  title: 28,
  huge: 40,
  touch: 56,
  radius: 18,
  pad: 16,
};

/** Depth comes from a hairline border (Latent uses rgba(255,255,255,.08)), not shadows. */
export const shadow = {
  borderWidth: 1,
  borderColor: '#272523',
};

/**
 * Type: a bookish serif for headings and big numbers (like Claude's and Latent's display type),
 * a clean grotesque for everything else. Both fall back to Android's Noto fonts for Indic scripts.
 */
export const SERIF = 'SourceSerif4_600SemiBold';
export const SERIF_REGULAR = 'SourceSerif4_400Regular';
export const SANS = {
  regular: 'InstrumentSans_400Regular',
  medium: 'InstrumentSans_500Medium',
  semibold: 'InstrumentSans_600SemiBold',
  bold: 'InstrumentSans_700Bold',
};
/** Kept for existing imports: big numbers and the wordmark now use the serif. */
export const WORDMARK_FONT = SERIF;
