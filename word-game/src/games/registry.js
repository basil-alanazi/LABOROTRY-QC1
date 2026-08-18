import reversedWords from './reversed-words'
import categories from './categories'

// كل لعبة جديدة تضاف هنا فقط — بدون أي تعديل على بقية النظام
export const GAME_REGISTRY = {
  'reversed-words': reversedWords,
  categories: categories,
}

export function getGame(id) {
  return GAME_REGISTRY[id]
}

export function listGames() {
  return Object.values(GAME_REGISTRY)
}
