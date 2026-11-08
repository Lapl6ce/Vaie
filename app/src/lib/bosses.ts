/**
 * Fantasy layer for the learning map. Every chapter is a realm on the map, and its chapter
 * test is the boss that guards it. Names are English and go through the translation layer.
 * Bosses are matched to the topic where it fits (a Storm Wyvern guards Electricity, etc.).
 */
export type Biome = 'fields' | 'mountains' | 'badlands' | 'crossroads' | 'marsh' | 'steppe' | 'crypt' | 'forest' | 'peaks' | 'volcano' | 'coast' | 'desert';

export type Boss = {
  name: string;
  emoji: string;
  /** Glow / lair colour */
  color: string;
  realm: string;
  biome: Biome;
  /** Line shown when the fight starts */
  taunt: string;
};

const BY_CHAPTER: Record<string, Boss> = {
  'c8-sci-crops': { name: 'The Locust King', emoji: '🦗', color: '#C9B24A', realm: 'The Golden Fields', biome: 'fields', taunt: 'My swarm will eat every harvest!' },
  'c8-sci-force': { name: 'The Stone Golem', emoji: '🗿', color: '#A39B8E', realm: 'Ironstone Quarry', biome: 'mountains', taunt: 'Nothing can push me. Nothing!' },
  'c8-math-lineq': { name: 'The Orc Warlord', emoji: '👹', color: '#E0705A', realm: 'The Orcish Badlands', biome: 'badlands', taunt: 'Solve for x, if you dare!' },
  'c8-math-compare': { name: 'The Goblin Merchant', emoji: '👺', color: '#E58A6B', realm: "Trader's Crossing", biome: 'crossroads', taunt: 'Every bargain hides a trick.' },
  'c9-sci-matter': { name: 'The Mist Wraith', emoji: '👻', color: '#9FB8C8', realm: 'Mistfen Marsh', biome: 'marsh', taunt: 'Solid, liquid or gas, I am all three.' },
  'c9-sci-motion': { name: 'The Dire Wolf', emoji: '🐺', color: '#B5B0A7', realm: 'Windrunner Steppe', biome: 'steppe', taunt: 'You cannot match my speed.' },
  'c9-math-numbers': { name: 'The Bone Lich', emoji: '💀', color: '#D8D2C2', realm: 'Crypt of Numbers', biome: 'crypt', taunt: 'Some numbers never end.' },
  'c9-math-lin2': { name: 'The Web Weaver', emoji: '🕷️', color: '#8FA68A', realm: 'Spidersilk Forest', biome: 'forest', taunt: 'Two lines, one web. Find where they meet.' },
  'c10-sci-elec': { name: 'The Storm Wyvern', emoji: '🐲', color: '#8FB3CF', realm: 'Thunderpeak', biome: 'peaks', taunt: 'Feel the current!' },
  'c10-sci-light': { name: 'The Ember Dragon', emoji: '🐉', color: '#F2555A', realm: 'The Mirror Volcano', biome: 'volcano', taunt: 'My fire bends all light.' },
  'c10-math-ap': { name: 'The Sea Kraken', emoji: '🐙', color: '#7FBFB2', realm: 'The Endless Coast', biome: 'coast', taunt: 'My arms go on and on and on…' },
  'c10-math-trig': { name: 'The Scorpion King', emoji: '🦂', color: '#E8C95F', realm: 'Desert of Angles', biome: 'desert', taunt: 'Every pyramid has its angle.' },
};

const FALLBACK: Boss[] = Object.values(BY_CHAPTER);

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function bossFor(chapterId: string): Boss {
  return BY_CHAPTER[chapterId] ?? FALLBACK[hash(chapterId) % FALLBACK.length];
}

/** Small deterministic PRNG so each realm's scenery is the same every time. */
export function seeded(seed: string) {
  let a = hash(seed) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
