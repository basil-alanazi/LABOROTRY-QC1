import GameScreen from './GameScreen'

export default {
  id: 'lip-reading',
  name: 'اقرأ الشفايف',
  description: 'ناطق يحرك شفايفه بدون صوت، والباقي يخمنون الكلمة.',
  longDescription:
    'كل جولة يطلع ناطق عشوائي يشوف كلمة سرية بس هو، ويحاول يوصلها للمجموعة بتحريك شفايفه بدون ما يطلع صوت. الباقي يخمنون بصوت عالي، ولما حد يعرفها الناطق يضغط على اسمه وياخذ 100 نقطة (والناطق ياخذ 50).',
  icon: '💋',
  color: 'accent',
  defaultRounds: 8,
  defaultSeconds: 40,
  defaultLanguage: 'ar',
  hasLanguageOption: false,
  minPlayers: 3,
  maxPlayers: 12,
  customFlow: true,
  GameScreen,
}
