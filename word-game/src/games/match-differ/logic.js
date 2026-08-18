export const QUESTIONS = [
  'برجر دجاج ولا لحم؟',
  'شاي ولا قهوة؟',
  'بحر ولا جبل؟',
  'صيف ولا شتاء؟',
  'حلو ولا حامض؟',
  'فطور ولا عشا؟',
  'قطة ولا كلب؟',
  'سفر ولا بيت؟',
  'أكشن ولا كوميدي؟',
  'بيتزا ولا برجر؟',
  'صباحي ولا ليلي؟',
  'رياضة ولا قراءة؟',
  'شوكولاتة ولا فانيليا؟',
  'مطعم ولا طبخ بيت؟',
  'مدينة ولا قرية؟',
  'رسائل ولا مكالمة؟',
  'صيف حار ولا شتاء بارد؟',
  'موسيقى هادئة ولا حماسية؟',
  'أفلام ولا مسلسلات؟',
  'رمل ولا ثلج؟',
]

export function pickQuestion(recentIndices = []) {
  const available = QUESTIONS.map((_, i) => i).filter((i) => !recentIndices.includes(i))
  const pool = available.length ? available : QUESTIONS.map((_, i) => i)
  const idx = pool[Math.floor(Math.random() * pool.length)]
  return { idx, question: QUESTIONS[idx] }
}

export function normalizeAnswer(str) {
  return (str || '').trim().replace(/[ً-ْ]/g, '').toLowerCase()
}

export function evaluateTeam(answersMap, roundType) {
  const values = Object.values(answersMap).map(normalizeAnswer)
  if (values.length < 2 || values.some((v) => !v)) return false
  if (roundType === 'match') {
    return values.every((v) => v === values[0])
  }
  return new Set(values).size === values.length
}
