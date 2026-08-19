import reversedWords from './reversed-words'
import categories from './categories'
import truthOrDare from './truth-or-dare'
import impostor from './impostor'
import matchDiffer from './match-differ'
import drawGuess from './draw-guess'
import uno from './uno'
import unoFlip from './uno-flip'
import stopClock from './stop-clock'
import lipReading from './lip-reading'
import screw from './screw'

// كل لعبة جديدة تضاف هنا فقط — بدون أي تعديل على بقية النظام
export const GAME_REGISTRY = {
  'reversed-words': reversedWords,
  categories: categories,
  'truth-or-dare': truthOrDare,
  impostor: impostor,
  'spot-diff': matchDiffer,
  'draw-guess': drawGuess,
  uno: uno,
  'uno-flip': unoFlip,
  'stop-clock': stopClock,
  'lip-reading': lipReading,
  screw: screw,
}

export function getGame(id) {
  return GAME_REGISTRY[id]
}

export function listGames() {
  return Object.values(GAME_REGISTRY)
}
