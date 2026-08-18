import GameScreen from './GameScreen'

export default {
  id: 'draw-guess',
  name: 'وش رسمت؟',
  description: 'ارسم وخلي جماعتك يخمنون شنو رسمت.',
  longDescription:
    'كل جولة يطلع رسام عشوائي يشوف كلمة سرية ويرسمها بلوحة مشتركة، والباقي يخمنون بالكتابة. أول واحد يخمن صح ياخذ 100 نقطة والرسام ياخذ 50.',
  icon: '✏️',
  color: 'primary',
  defaultRounds: 8,
  defaultSeconds: 75,
  defaultLanguage: 'ar',
  hasLanguageOption: false,
  minPlayers: 3,
  maxPlayers: 10,
  customFlow: true,
  GameScreen,
}
