import type { Lang } from './types.js'

export type MissionKind = 'sabotage' | 'bluff'
export type MissionDifficulty = 'mild' | 'wild' | 'stealth'
export type PromptPack = 'classic' | 'food' | 'dark' | 'absurd'

export type MissionDef = {
  id: string
  kind: MissionKind
  difficulty: MissionDifficulty
  sv: string
  en: string
}

const CLASSIC_SV = [
  'katt',
  'pizza',
  'cykel',
  'drake',
  'kaffe',
  'robot',
  'strand',
  'banan',
  'vampyr',
  'tåg',
  'glass',
  'dinosaurier',
  'paraply',
  'astronaut',
  'korv',
  'spöke',
  'gitarr',
  'ananas',
  'ninja',
  'elefant',
  'fyrverkeri',
  'surfer',
  'bibliotek',
  'hamburger',
  'uggla',
  'skattkista',
  'helikopter',
  'bläckfisk',
  'regnbåge',
  'zombie',
]

const CLASSIC_EN = [
  'cat',
  'pizza',
  'bicycle',
  'dragon',
  'coffee',
  'robot',
  'beach',
  'banana',
  'vampire',
  'train',
  'icecream',
  'dinosaur',
  'umbrella',
  'astronaut',
  'hotdog',
  'ghost',
  'guitar',
  'pineapple',
  'ninja',
  'elephant',
  'fireworks',
  'surfer',
  'library',
  'burger',
  'owl',
  'treasure',
  'helicopter',
  'octopus',
  'rainbow',
  'zombie',
]

const FOOD_SV = [
  'taco',
  'sushi',
  'våffla',
  'kebab',
  'smoothie',
  'ostmacka',
  'chokladkaka',
  'räksmörgås',
  'chili',
  'popcorn',
  'munk',
  'grillkorv',
  'avokado',
  'pannkaka',
  'glassstrut',
]

const FOOD_EN = [
  'taco',
  'sushi',
  'waffle',
  'kebab',
  'smoothie',
  'cheese sandwich',
  'chocolate cake',
  'shrimp sandwich',
  'chili',
  'popcorn',
  'donut',
  'hot dog',
  'avocado',
  'pancake',
  'ice cream cone',
]

const DARK_SV = [
  'spökhus',
  'kyrkogård',
  'fullmåne',
  'häxa',
  'skelett',
  'mörk skog',
  'blodmåne',
  'svart katt',
  'vampyrslott',
  'zombieattack',
  'spindel',
  'krypta',
  'dimmig sjö',
  'övergiven cirkus',
  'mardröm',
]

const DARK_EN = [
  'haunted house',
  'graveyard',
  'full moon',
  'witch',
  'skeleton',
  'dark forest',
  'blood moon',
  'black cat',
  'vampire castle',
  'zombie attack',
  'spider',
  'crypt',
  'foggy lake',
  'abandoned circus',
  'nightmare',
]

const ABSURD_SV = [
  'flygande ko',
  'pratsam toast',
  'banan i kostym',
  'robotkatt',
  'självkörande soffa',
  'dansande kaktus',
  'älg med jetpack',
  'sjungande toalett',
  'pizza med ben',
  'moln som gråter limonad',
  'tidmaskin i kylskåp',
  'ninja-anka',
  'haj på cykel',
  'kunglig potatis',
  'magisk limpa',
]

const ABSURD_EN = [
  'flying cow',
  'talking toast',
  'banana in a suit',
  'robot cat',
  'self-driving sofa',
  'dancing cactus',
  'moose with jetpack',
  'singing toilet',
  'pizza with legs',
  'cloud crying lemonade',
  'time machine fridge',
  'ninja duck',
  'shark on a bike',
  'royal potato',
  'magic loaf',
]

export const PROMPT_PACKS: Record<PromptPack, { sv: string[]; en: string[] }> = {
  classic: { sv: CLASSIC_SV, en: CLASSIC_EN },
  food: { sv: FOOD_SV, en: FOOD_EN },
  dark: { sv: DARK_SV, en: DARK_EN },
  absurd: { sv: ABSURD_SV, en: ABSURD_EN },
}

export const PROMPT_PACK_IDS: PromptPack[] = ['classic', 'food', 'dark', 'absurd']

export function isPromptPack(v: string): v is PromptPack {
  return (PROMPT_PACK_IDS as string[]).includes(v)
}

export const SABOTAGE_MISSIONS: MissionDef[] = [
  { id: 'seagull', kind: 'sabotage', difficulty: 'mild', sv: 'Lägg till en arg mås', en: 'Add an angry seagull' },
  { id: 'hat', kind: 'sabotage', difficulty: 'mild', sv: 'Ge allt en jättehatt', en: 'Give everything a giant hat' },
  { id: 'rain', kind: 'sabotage', difficulty: 'mild', sv: 'Lägg till ösregn', en: 'Add pouring rain' },
  { id: 'baby', kind: 'sabotage', difficulty: 'mild', sv: 'Gör en baby-version', en: 'Make it baby-cute' },
  { id: 'fire', kind: 'sabotage', difficulty: 'wild', sv: 'Lägg till brand', en: 'Add fire' },
  { id: 'monster', kind: 'sabotage', difficulty: 'wild', sv: 'Förvandla det till ett monster', en: 'Turn it into a monster' },
  { id: 'ink25', kind: 'sabotage', difficulty: 'wild', sv: 'Bläcka över 25% av bilden', en: 'Inkblot 25% of the image' },
  { id: 'ad', kind: 'sabotage', difficulty: 'wild', sv: 'Gör det till en reklam', en: 'Make it into an ad' },
  {
    id: 'text',
    kind: 'sabotage',
    difficulty: 'wild',
    sv: 'Rita in texten “REKLABET”',
    en: 'Add the text “TOTALLY FINE”',
  },
  { id: 'censor', kind: 'sabotage', difficulty: 'wild', sv: 'Censurera ansiktet', en: 'Censor the face' },
]

/** Unlocked after stealth streak — subtle sabotage */
export const STEALTH_MISSIONS: MissionDef[] = [
  {
    id: 'three-lines',
    kind: 'sabotage',
    difficulty: 'stealth',
    sv: 'Ändra med bara TRE streck',
    en: 'Change it with only THREE strokes',
  },
  {
    id: 'tiny-evil',
    kind: 'sabotage',
    difficulty: 'stealth',
    sv: 'Lägg till något litet och elakt',
    en: 'Add one tiny evil detail',
  },
  {
    id: 'almost-same',
    kind: 'sabotage',
    difficulty: 'stealth',
    sv: 'Gör det nästan likadant — men fel',
    en: 'Make it almost the same — but wrong',
  },
]

export const BLUFF_MISSIONS: MissionDef[] = [
  { id: 'cloud', kind: 'bluff', difficulty: 'mild', sv: 'Lägg till ett litet moln', en: 'Add a tiny cloud' },
  { id: 'flower', kind: 'bluff', difficulty: 'mild', sv: 'Rita in en blomma', en: 'Draw a flower somewhere' },
  { id: 'spark', kind: 'bluff', difficulty: 'mild', sv: 'Lägg till tre stjärnor', en: 'Add three stars' },
  { id: 'bird', kind: 'bluff', difficulty: 'mild', sv: 'Lägg till en fågel i bakgrunden', en: 'Add a bird in the background' },
  { id: 'dots', kind: 'bluff', difficulty: 'mild', sv: 'Strö prickar över allt', en: 'Scatter dots everywhere' },
  { id: 'wave', kind: 'bluff', difficulty: 'mild', sv: 'Lägg till en våg', en: 'Add a wave' },
  { id: 'moon', kind: 'bluff', difficulty: 'mild', sv: 'Rita in en måne', en: 'Draw a moon' },
  { id: 'arrow', kind: 'bluff', difficulty: 'mild', sv: 'Rita en pil som pekar fel', en: 'Draw an arrow pointing the wrong way' },
]

export function promptsFor(lang: Lang, pack: PromptPack = 'classic') {
  const p = PROMPT_PACKS[pack] ?? PROMPT_PACKS.classic
  return lang === 'en' ? p.en : p.sv
}

export function missionLabel(m: MissionDef, lang: Lang) {
  return lang === 'en' ? m.en : m.sv
}

export function pickPrompt(lang: Lang, exclude: string[] = [], pack: PromptPack = 'classic') {
  const pool = promptsFor(lang, pack).filter((p) => !exclude.includes(p))
  const list = pool.length > 0 ? pool : promptsFor(lang, pack)
  return list[Math.floor(Math.random() * list.length)]!
}

export function pickSabotageMission(excludeIds: string[] = [], preferStealth = false) {
  const source = preferStealth ? STEALTH_MISSIONS : SABOTAGE_MISSIONS
  const pool = source.filter((m) => !excludeIds.includes(m.id))
  const list = pool.length > 0 ? pool : source
  return list[Math.floor(Math.random() * list.length)]!
}

export function pickBluffMission(excludeIds: string[] = []) {
  const pool = BLUFF_MISSIONS.filter((m) => !excludeIds.includes(m.id))
  const list = pool.length > 0 ? pool : BLUFF_MISSIONS
  return list[Math.floor(Math.random() * list.length)]!
}

export function buildRoast(lang: Lang, spotted: number, total: number, mode: string): string {
  if (mode === 'doubleBluff') {
    return lang === 'en'
      ? 'Plot twist — nobody sabotaged. You all got bluffed.'
      : 'Plot twist — ingen saboterade. Ni blev bluffade.'
  }
  if (total <= 0) {
    return lang === 'en' ? 'Silence in the room…' : 'Tyst i rummet…'
  }
  const ratio = spotted / total
  if (spotted === 0) {
    return lang === 'en'
      ? 'Perfect crime. Nobody spotted it.'
      : 'Perfekt brott. Ingen såg det.'
  }
  if (ratio < 0.35) {
    return lang === 'en'
      ? `Only ${spotted}/${total} spotted it — sneaky.`
      : `Bara ${spotted}/${total} såg det — smygigt.`
  }
  if (ratio < 0.6) {
    return lang === 'en'
      ? `${spotted}/${total} caught it. Mid sabotage.`
      : `${spotted}/${total} såg det. Medel-sabotage.`
  }
  if (spotted === total) {
    return lang === 'en'
      ? 'Everyone saw it. Absolute flop.'
      : 'Alla såg det. Total flop.'
  }
  return lang === 'en'
    ? `${spotted}/${total} saw through it — loud sabotage.`
    : `${spotted}/${total} genomskådade det — högljutt sabotage.`
}
