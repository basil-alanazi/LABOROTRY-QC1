import GameScreen from './GameScreen'

export default {
  id: 'uno',
  name: 'UNO',
  description: 'لعبة الورق الكلاسيكية اللي تعرفها.',
  longDescription:
    'وزّع الأوراق، طابق باللون أو الرقم، واستخدم أوراق سكيب وريفرس واسحب اتنين ووايلد عشان تخلص أوراقك أول واحد وتفوز.',
  icon: '🃏',
  color: 'accent',
  defaultRounds: 1,
  defaultSeconds: 45,
  defaultLanguage: 'ar',
  hasLanguageOption: false,
  hideRoundConfig: true,
  minPlayers: 2,
  maxPlayers: 8,
  customFlow: true,
  GameScreen,
}
