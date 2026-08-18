import GameScreen from './GameScreen'

export default {
  id: 'categories',
  name: 'أتوبيس',
  description: 'جماد نبات حيوان دولة اسم ولد اسم بنت — أول واحد يوقف يوقف الكل.',
  longDescription:
    'كل جولة يطلع حرف عشوائي وتعبّون 6 فئات (جماد، نبات، حيوان، دولة، اسم ولد، اسم بنت). أول واحد يضغط "توقف" توقف الجولة للكل فورًا، وبعدها تتقارن الإجابات: كلمة صحيحة وفريدة = نقطتين، صحيحة ومكررة = نقطة، غلط أو فاضية = صفر.',
  icon: '🚌',
  color: 'primary',
  defaultRounds: 6,
  defaultSeconds: 25,
  defaultLanguage: 'ar',
  hasLanguageOption: false,
  minPlayers: 1,
  maxPlayers: 12,
  customFlow: true,
  GameScreen,
}
