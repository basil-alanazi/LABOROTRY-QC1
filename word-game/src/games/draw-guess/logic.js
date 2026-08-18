import { WORDS_AR, normalize } from '../reversed-words/logic'

export function pickWord(recentIndices = []) {
  const available = WORDS_AR.map((_, i) => i).filter((i) => !recentIndices.includes(i))
  const pool = available.length ? available : WORDS_AR.map((_, i) => i)
  const idx = pool[Math.floor(Math.random() * pool.length)]
  return { idx, word: WORDS_AR[idx] }
}

export function checkGuess(guess, word) {
  return normalize(guess) === normalize(word)
}
