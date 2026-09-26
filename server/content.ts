import type { Lang } from './types.js'

export type MissionKind = 'sabotage' | 'bluff'

export type MissionDef = {
  id: string
  kind: MissionKind
  sv: string
  en: string
}

export const PROMPTS_SV = [
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

export const PROMPTS_EN = [
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

export const SABOTAGE_MISSIONS: MissionDef[] = [
  { id: 'seagull', kind: 'sabotage', sv: 'Lägg till en arg mås', en: 'Add an angry seagull' },
  { id: 'ink25', kind: 'sabotage', sv: 'Bläcka över 25% av bilden', en: 'Inkblot 25% of the image' },
  { id: 'monster', kind: 'sabotage', sv: 'Förvandla det till ett monster', en: 'Turn it into a monster' },
  { id: 'ad', kind: 'sabotage', sv: 'Gör det till en reklam', en: 'Make it into an ad' },
  {
    id: 'text',
    kind: 'sabotage',
    sv: 'Rita in texten “REKLABET”',
    en: 'Add the text “TOTALLY FINE”',
  },
  { id: 'baby', kind: 'sabotage', sv: 'Gör en baby-version', en: 'Make it baby-cute' },
  { id: 'fire', kind: 'sabotage', sv: 'Lägg till brand', en: 'Add fire' },
  { id: 'censor', kind: 'sabotage', sv: 'Censurera ansiktet', en: 'Censor the face' },
  { id: 'hat', kind: 'sabotage', sv: 'Ge allt en jättehatt', en: 'Give everything a giant hat' },
  { id: 'rain', kind: 'sabotage', sv: 'Lägg till ösregn', en: 'Add pouring rain' },
]

export const BLUFF_MISSIONS: MissionDef[] = [
  { id: 'clearer', kind: 'bluff', sv: 'Gör motivet tydligare', en: 'Make the subject clearer' },
  { id: 'sun', kind: 'bluff', sv: 'Lägg till en sol', en: 'Add a sun' },
  { id: 'color', kind: 'bluff', sv: 'Förbättra färgerna', en: 'Improve the colors' },
  { id: 'detail', kind: 'bluff', sv: 'Lägg till tre små detaljer', en: 'Add three small details' },
  { id: 'frame', kind: 'bluff', sv: 'Rita en fin ram runt', en: 'Draw a nice frame around it' },
  { id: 'smile', kind: 'bluff', sv: 'Se till att någon ler', en: 'Make sure someone is smiling' },
]

export function promptsFor(lang: Lang) {
  return lang === 'en' ? PROMPTS_EN : PROMPTS_SV
}

export function missionLabel(m: MissionDef, lang: Lang) {
  return lang === 'en' ? m.en : m.sv
}

export function pickPrompt(lang: Lang, exclude: string[] = []) {
  const pool = promptsFor(lang).filter((p) => !exclude.includes(p))
  const list = pool.length > 0 ? pool : promptsFor(lang)
  return list[Math.floor(Math.random() * list.length)]!
}

export function pickSabotageMission(excludeIds: string[] = []) {
  const pool = SABOTAGE_MISSIONS.filter((m) => !excludeIds.includes(m.id))
  const list = pool.length > 0 ? pool : SABOTAGE_MISSIONS
  return list[Math.floor(Math.random() * list.length)]!
}

export function pickBluffMission(excludeIds: string[] = []) {
  const pool = BLUFF_MISSIONS.filter((m) => !excludeIds.includes(m.id))
  const list = pool.length > 0 ? pool : BLUFF_MISSIONS
  return list[Math.floor(Math.random() * list.length)]!
}

/** Prompt + 5 decoys, shuffled */
export function guessOptions(prompt: string, lang: Lang, count = 6) {
  const all = promptsFor(lang).filter((p) => p !== prompt)
  const decoys: string[] = []
  const pool = [...all]
  while (decoys.length < count - 1 && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length)
    decoys.push(pool.splice(i, 1)[0]!)
  }
  const opts = [prompt, ...decoys]
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[opts[i], opts[j]] = [opts[j]!, opts[i]!]
  }
  return opts
}
