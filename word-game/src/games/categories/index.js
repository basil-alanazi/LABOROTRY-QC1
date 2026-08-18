import GameScreen from './GameScreen'
import { pickRoundKey, getRoundData, checkAnswer, revealAnswer } from './logic'

export default {
  id: 'categories',
  name: 'جماد نبات إنسان بلد',
  description: 'أسرع وحد يكمل الفئات بحرف معين.',
  longDescription:
    'كل جولة يطلع حرف عشوائي، وأول واحد يكتب جماد ونبات وإنسان وبلد يبدأون بهذا الحرف ياخذ 100 نقطة.',
  icon: '🌱',
  color: 'primary',
  defaultRounds: 8,
  defaultSeconds: 35,
  defaultLanguage: 'ar',
  hasLanguageOption: false,
  minPlayers: 1,
  maxPlayers: 12,
  pickRoundKey,
  getRoundData,
  checkAnswer,
  revealAnswer,
  GameScreen,
}
