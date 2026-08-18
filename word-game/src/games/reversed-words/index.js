import GameScreen from './GameScreen'
import { pickRoundKey, getRoundData, checkAnswer, revealAnswer } from './logic'

export default {
  id: 'reversed-words',
  name: 'كلمات مقلوبة',
  description: 'فك الكلمات المعكوسة بأسرع وقت.',
  longDescription:
    'كل جولة تطلع كلمة بحروفها معكوسة، وأول واحد يكتبها صح ياخذ 100 نقطة. الأسرع والأذكى يفوز!',
  icon: '🔄',
  color: 'primary',
  defaultRounds: 10,
  defaultSeconds: 25,
  defaultLanguage: 'mixed',
  hasLanguageOption: true,
  minPlayers: 1,
  maxPlayers: 12,
  pickRoundKey,
  getRoundData,
  checkAnswer,
  revealAnswer,
  GameScreen,
}
