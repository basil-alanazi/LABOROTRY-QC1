export const LETTERS = [
  'ا', 'ب', 'ت', 'ج', 'د', 'ر', 'ز', 'س', 'ص', 'ط',
  'ع', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'ي',
]

export const FIELDS = [
  { key: 'jamad', label: 'جماد' },
  { key: 'nabat', label: 'نبات' },
  { key: 'hayawan', label: 'حيوان' },
  { key: 'dawla', label: 'دولة' },
  { key: 'ismWalad', label: 'اسم ولد' },
  { key: 'ismBint', label: 'اسم بنت' },
]

const ALEF_VARIANTS = ['أ', 'إ', 'آ', 'ا']

function normalizeAlef(ch) {
  return ALEF_VARIANTS.includes(ch) ? 'ا' : ch
}

export function normalizeWord(str) {
  return (str || '').trim().replace(/[ً-ْ]/g, '')
}

export function startsWithLetter(word, letter) {
  const w = normalizeWord(word)
  if (!w) return false
  return normalizeAlef(w[0]) === normalizeAlef(letter)
}

export function pickLetter(recentLetters = []) {
  const available = LETTERS.filter((l) => !recentLetters.includes(l))
  const pool = available.length ? available : LETTERS
  return pool[Math.floor(Math.random() * pool.length)]
}

export function scoreField(playerWords, letter) {
  return scoreFieldWithOverrides(playerWords, letter, {})
}

export function scoreFieldWithOverrides(playerWords, letter, overrides = {}) {
  const normalized = {}
  for (const [pid, word] of Object.entries(playerWords)) {
    const baseValid = startsWithLetter(word, letter)
    const valid = overrides[pid] !== undefined ? overrides[pid] : baseValid
    normalized[pid] = valid ? normalizeWord(word).toLowerCase() : null
  }
  const counts = {}
  for (const v of Object.values(normalized)) {
    if (v) counts[v] = (counts[v] || 0) + 1
  }
  const points = {}
  for (const [pid, v] of Object.entries(normalized)) {
    points[pid] = !v ? 0 : counts[v] > 1 ? 1 : 2
  }
  return points
}
