import GameScreen from './GameScreen'

export default {
  id: 'stop-clock',
  name: 'أوقف الساعة',
  description: 'عداد مشترك، دور بعد دور — إلي يفوّت الهدف يطلع.',
  longDescription:
    'عداد واحد مشترك بين الكل يبدأ من الصفر لهدف عشوائي. كل لاعب بدوره يحاول يوقفه أقرب ما يكون من الهدف بدون ما يتجاوزه. لو تجاوزه، يطلع من اللعبة وتبدأ جولة جديدة بهدف جديد للباقين، لين ما يبقى لاعب واحد بس.',
  icon: '⏱️',
  color: 'danger',
  defaultRounds: 1,
  defaultSeconds: 45,
  defaultLanguage: 'ar',
  hasLanguageOption: false,
  hideRoundConfig: true,
  minPlayers: 2,
  maxPlayers: 10,
  customFlow: true,
  GameScreen,
}
