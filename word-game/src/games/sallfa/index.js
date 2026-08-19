import GameScreen from './GameScreen'

export default {
  id: 'sallfa',
  name: 'مين برا السالفة؟',
  description: 'فئة وحدة، كلمتين قريبتين — واحد بس عنده الكلمة الثانية.',
  longDescription:
    'المضيف يختار فئة (دول، أكل، حيوانات...). الكل ياخذ نفس الكلمة إلا واحد "برا السالفة" ياخذ كلمة ثانية من نفس الفئة. تناقشون وتسألون بعض بصوت عالي، وبعدين تصوتون مين تشكون فيه. اللي برا السالفة بعدها يحاول يخمن الكلمة الأصلية: لو مسكوه ويعرف الكلمة ياخذ نقطة، ولو ما مسكوه أحد ويعرفها ياخذ 3 نقاط! واللي يمسكونه ياخذون نقطتين لكل واحد.',
  icon: '🕵️',
  color: 'danger',
  defaultRounds: 6,
  defaultSeconds: 25,
  defaultLanguage: 'ar',
  hasLanguageOption: false,
  minPlayers: 4,
  maxPlayers: 12,
  customFlow: true,
  GameScreen,
}
