import GameScreen from './GameScreen'

export default {
  id: 'spot-diff',
  name: 'نختلف ونتشابه',
  description: 'فريقين، سؤال وحد، لازم تتفقون أو تختلفون حسب الجولة.',
  longDescription:
    'قسّموا نفسكم فريقين. كل جولة يجي سؤال للفريقين بنفس الوقت، وتصير إما "تشابهوا" (لازم كل الفريق يجاوبون نفس الشي) أو "اختلفوا" (لازم كل واحد يجاوب شي مختلف). الفريق اللي يحقق الشرط ياخذ نقطة.',
  icon: '🔍',
  color: 'primary',
  defaultRounds: 8,
  defaultSeconds: 25,
  defaultLanguage: 'ar',
  hasLanguageOption: false,
  hasTeams: true,
  minPlayers: 4,
  maxPlayers: 12,
  customFlow: true,
  GameScreen,
}
