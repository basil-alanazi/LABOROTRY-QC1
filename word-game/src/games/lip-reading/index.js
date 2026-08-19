import GameScreen from './GameScreen'

export default {
  id: 'lip-reading',
  name: 'اقرأ الشفايف',
  description: 'فريقين، ناطق من كل فريق يحرك شفايفه بدون صوت والفريق يخمن.',
  longDescription:
    'قسّموا نفسكم فريقين. الجولة تدور بالتناوب بين الفريقين — كل جولة يطلع ناطق من الفريق اللي عليه الدور يشوف كلمة سرية بس هو، ويحاول يوصلها لفريقه بتحريك شفايفه بدون ما يطلع صوت. لما أحد الفريق يعرفها، الناطق يضغط على اسمه وياخذ الفريق كامل 100 نقطة لكل عضو.',
  icon: '💋',
  color: 'accent',
  defaultRounds: 8,
  defaultSeconds: 40,
  defaultLanguage: 'ar',
  hasLanguageOption: false,
  hasTeams: true,
  minPlayers: 4,
  maxPlayers: 12,
  customFlow: true,
  GameScreen,
}
