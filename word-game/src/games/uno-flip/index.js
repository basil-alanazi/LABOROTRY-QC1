import GameScreen from './GameScreen'

export default {
  id: 'uno-flip',
  name: 'UNO Flip',
  description: 'نفس أونو بس بوجهين ومفاجآت أكثر.',
  longDescription:
    'نفس أونو الكلاسيكية بس كل ورقة فيها وجهين: وجه فاتح عادي، ووجه غامق أقسى (سحب أكثر). ورقة "فليب" تقلب اللعبة كلها من وجه لوجه فجأة.',
  icon: '🔄',
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
