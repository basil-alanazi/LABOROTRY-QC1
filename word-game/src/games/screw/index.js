import GameScreen from './GameScreen'

export default {
  id: 'screw',
  name: 'سكرو',
  description: 'أربع كروت مقلوبة، وأقل مجموع يفوز — لعبة ذاكرة وخداع.',
  longDescription:
    'كل لاعب عنده 4 كروت مقلوبة، تشوف وحدتين بس بالبداية وتحفظهم. كل دور تسحب كرت وتقرر تبدله بواحد من كروتك أو ترميه — بعض الكروت لها قدرات خاصة (نظرة، تجسس، تبديل أعمى، أو نظرة+تبديل) تشتغل بس لو رميتها مباشرة. لما تحس مجموعك أقل شي، قول "سكرو"! تستمر الأيادي لين يوصل أحد 100 نقطة، وأقل مجموع تراكمي يفوز.',
  icon: '🃏',
  color: 'primary',
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
