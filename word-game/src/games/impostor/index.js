import GameScreen from './GameScreen'
import { pickRoundKey, getRoundData, checkAnswer, revealAnswer } from './logic'

export default {
  id: 'impostor',
  name: 'من الإمبوستر؟',
  description: 'خمن مين الدخيل بينكم قبل ما يكشفكم.',
  longDescription:
    'كل جولة الكل ياخذ نفس الكلمة إلا واحد (الإمبوستر) اللي ما يعرفها. ناقشوا بدون ما تبوحون بالكلمة، وحاولوا تمسكوا الإمبوستر قبل لا ينجو.',
  icon: '🕵️',
  color: 'danger',
  defaultRounds: 6,
  defaultSeconds: 60,
  defaultLanguage: 'ar',
  hasLanguageOption: false,
  minPlayers: 3,
  maxPlayers: 12,
  pickRoundKey,
  getRoundData,
  checkAnswer,
  revealAnswer,
  GameScreen,
}
