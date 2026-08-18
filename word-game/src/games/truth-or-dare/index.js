import GameScreen from './GameScreen'
import { pickRoundKey, getRoundData, checkAnswer, revealAnswer, MODES } from './logic'

export default {
  id: 'truth-or-dare',
  name: 'صراحة ولا جرأة',
  description: 'صراحة ولا جرأة؟ جماعتك يقررون.',
  longDescription:
    'كل جولة يطلع سؤال صراحة أو تحدي جرأة، وأول واحد يسويه أو يجاوب عليه بصراحة يضغط "خلصت" وياخذ 100 نقطة. اختار نوع المجموعة (أصدقاء / عائلة / أزواج) عشان الأسئلة تناسبكم.',
  icon: '🎭',
  color: 'accent',
  defaultRounds: 10,
  defaultSeconds: 45,
  defaultLanguage: 'friends',
  hasLanguageOption: true,
  languageLabel: 'نوع المجموعة',
  languageOptions: MODES,
  minPlayers: 2,
  maxPlayers: 12,
  pickRoundKey,
  getRoundData,
  checkAnswer,
  revealAnswer,
  GameScreen,
}
