export const QUESTION_PAIRS = [
  { normal: 'وش أكثر شي تحبه بالصبح؟', impostor: 'وش أكثر شي تكرهه بالصبح؟' },
  { normal: 'وش أفضل أكلة عندك؟', impostor: 'وش أسوأ أكلة عندك؟' },
  { normal: 'مين أكثر شخص يضحكك؟', impostor: 'مين أكثر شخص يضايقك؟' },
  { normal: 'وش أحلى ذكرى ليك؟', impostor: 'وش أسوأ ذكرى ليك؟' },
  { normal: 'لو تسافر، وين تحب تروح؟', impostor: 'لو تسافر، وين ما تحب تروح أبد؟' },
  { normal: 'وش أكثر شي يفرحك؟', impostor: 'وش أكثر شي يحزنك؟' },
  { normal: 'مين أكثر شخص تثق فيه؟', impostor: 'مين أكثر شخص ما تثق فيه؟' },
  { normal: 'وش هوايتك المفضلة؟', impostor: 'وش أكثر شي تكره تسويه؟' },
  { normal: 'وش أكثر فيلم عجبك؟', impostor: 'وش أكثر فيلم ما عجبك؟' },
  { normal: 'وش أحلى يوم بالأسبوع؟', impostor: 'وش أسوأ يوم بالأسبوع؟' },
  { normal: 'وش أكثر صوت يريحك؟', impostor: 'وش أكثر صوت يضايقك؟' },
  { normal: 'وش أكثر شي تفتخر فيه بنفسك؟', impostor: 'وش أكثر شي تندم عليه؟' },
  { normal: 'مين تتمنى تكون مثله؟', impostor: 'مين ما تحب تكون مثله أبد؟' },
  { normal: 'وش أحلى هدية استلمتها؟', impostor: 'وش أسوأ هدية استلمتها؟' },
  { normal: 'وش أكثر مكان يريحك؟', impostor: 'وش أكثر مكان يوترك؟' },
  { normal: 'لو تقدر تكتسب موهبة، وش تختار؟', impostor: 'لو تقدر توقف موهبة عندك، وش تختار؟' },
  { normal: 'وش أكثر شي يضحك بالمجموعة هذي؟', impostor: 'وش أكثر شي يزعجك بالمجموعة هذي؟' },
  { normal: 'وش أكثر لبس مريح لك؟', impostor: 'وش أكثر لبس ما ترتاح فيه؟' },
  { normal: 'مين أكثر واحد يشبهك بالطبع؟', impostor: 'مين أكثر واحد يختلف عنك بالطبع؟' },
  { normal: 'وش أكثر شي تنتظره هالأسبوع؟', impostor: 'وش أكثر شي يتضايق منه هالأسبوع؟' },
  { normal: 'وش أفضل موسم عندك؟', impostor: 'وش أسوأ موسم عندك؟' },
  { normal: 'وش أكثر لعبة تحبها؟', impostor: 'وش أكثر لعبة ما تطيقها؟' },
  { normal: 'مين أكثر شخص مؤثر فيك؟', impostor: 'مين أكثر شخص مزعج بحياتك؟' },
  { normal: 'وش أكثر شي يخليك مرتاح؟', impostor: 'وش أكثر شي يوترك؟' },
]

export function pickQuestionPair(recentIndices = []) {
  const available = QUESTION_PAIRS.map((_, i) => i).filter((i) => !recentIndices.includes(i))
  const pool = available.length ? available : QUESTION_PAIRS.map((_, i) => i)
  const idx = pool[Math.floor(Math.random() * pool.length)]
  return { idx, pair: QUESTION_PAIRS[idx] }
}
