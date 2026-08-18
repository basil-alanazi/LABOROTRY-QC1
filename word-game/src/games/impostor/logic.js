export const WORDS = [
  'قهوة', 'شاي', 'مطعم', 'مستشفى', 'مطار', 'مدرسة', 'جامعة', 'شاطئ',
  'جبل', 'صحراء', 'سيارة', 'دراجة', 'طيار', 'طبيب', 'مهندس', 'معلم',
  'شرطي', 'طباخ', 'كتاب', 'قلم', 'هاتف', 'حاسوب', 'ساعة', 'مرآة',
  'مفتاح', 'باب', 'نافذة', 'ثلاجة', 'فرن', 'سرير', 'وسادة', 'بطانية',
  'حديقة', 'ملعب', 'سينما', 'مكتبة', 'صيدلية', 'بنك', 'فندق', 'مسبح',
]

export function pickRoundKey(recentKeys = [], language, playerIds = []) {
  const recentWordIdx = recentKeys.map((k) => k?.wordIndex)
  const availableWords = WORDS.map((_, i) => i).filter((i) => !recentWordIdx.includes(i))
  const wordPool = availableWords.length ? availableWords : WORDS.map((_, i) => i)
  const wordIndex = wordPool[Math.floor(Math.random() * wordPool.length)]
  const impostorId = playerIds.length ? playerIds[Math.floor(Math.random() * playerIds.length)] : null
  return { wordIndex, impostorId }
}

export function getRoundData(key) {
  return { word: WORDS[key.wordIndex], impostorId: key.impostorId }
}

export function checkAnswer(key, guessPlayerId) {
  return !!key?.impostorId && guessPlayerId === key.impostorId
}

export function revealAnswer(key) {
  return { word: WORDS[key.wordIndex], impostorId: key.impostorId }
}
