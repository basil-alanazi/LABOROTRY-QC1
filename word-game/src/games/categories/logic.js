export const LETTERS = [
  'ا', 'ب', 'ت', 'ج', 'د', 'ر', 'ز', 'س', 'ص', 'ط',
  'ع', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'ي',
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

export function pickRoundKey(recentKeys = []) {
  const available = LETTERS.map((_, i) => i).filter((i) => !recentKeys.includes(i))
  const idxPool = available.length ? available : LETTERS.map((_, i) => i)
  return idxPool[Math.floor(Math.random() * idxPool.length)]
}

export function getRoundData(key) {
  return { letter: LETTERS[key] }
}

export function checkAnswer(key, guess) {
  const letter = LETTERS[key]
  if (!guess || typeof guess !== 'object') return false
  const { jamad, nabat, insan, balad } = guess
  return [jamad, nabat, insan, balad].every((w) => startsWithLetter(w, letter))
}

export function revealAnswer(key) {
  return LETTERS[key]
}
