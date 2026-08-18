import GameScreen from './GameScreen'

export default {
  id: 'impostor',
  name: 'من الإمبوستر؟',
  description: 'كل واحد ياخذ سؤال إلا الإمبوستر ياخذ سؤال مختلف.',
  longDescription:
    'كل الكل ياخذون نفس السؤال إلا الإمبوستر (أو اثنين أحيانًا) ياخذون سؤال مختلف شوي. الكل يجاوب، وبعدها تشوفون كل الإجابات جنب السؤال الأصلي وتحاولون تكتشفون مين الإمبوستر بالتصويت.',
  icon: '🕵️',
  color: 'danger',
  defaultRounds: 6,
  defaultSeconds: 25,
  defaultLanguage: 'ar',
  hasLanguageOption: false,
  minPlayers: 3,
  maxPlayers: 12,
  customFlow: true,
  GameScreen,
}
