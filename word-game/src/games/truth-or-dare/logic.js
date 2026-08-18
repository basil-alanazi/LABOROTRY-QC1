export const PROMPTS = [
  { type: 'truth', text: 'وش أكثر شي تندم عليه هالسنة؟' },
  { type: 'truth', text: 'وش أكذوبة قلتها وما انكشفت؟' },
  { type: 'truth', text: 'مين أقرب شخص لك بالمجموعة هذي؟' },
  { type: 'truth', text: 'وش أكثر خوف عندك بصراحة؟' },
  { type: 'truth', text: 'آخر مرة كذبت فيها على حد بالغرفة كانت متى؟' },
  { type: 'truth', text: 'وش أسوأ هدية استلمتها بحياتك؟' },
  { type: 'truth', text: 'لو تقدر تغير شي بشخصيتك وش بيكون؟' },
  { type: 'truth', text: 'وش أكثر موقف محرج صار لك؟' },
  { type: 'truth', text: 'مين أكثر شخص أثر فيك بحياتك؟' },
  { type: 'truth', text: 'وش أسوأ عادة عندك؟' },
  { type: 'truth', text: 'لو تقدر تعرف المستقبل، وش أول شي تسأل عنه؟' },
  { type: 'truth', text: 'وش أكثر شي يضحكك وأنت لحالك؟' },
  { type: 'truth', text: 'شنو آخر شي بحثت عنه بالجوال؟' },
  { type: 'truth', text: 'وش أكثر لحظة فخرت فيها بنفسك؟' },
  { type: 'truth', text: 'لو تقدر تعيش يوم وحد من المجموعة، مين تختار وليه؟' },
  { type: 'truth', text: 'وش أغرب حلم شفته؟' },
  { type: 'truth', text: 'مين شخص تتمنى تصالحه؟' },
  { type: 'truth', text: 'وش أكثر شي يضايقك بالناس؟' },
  { type: 'truth', text: 'لو فلوسك تكفي عمرك كله، وش أول شي تسويه؟' },
  { type: 'truth', text: 'وش أطرف موقف صار لك مع أهلك؟' },
  { type: 'truth', text: 'شنو أكثر تطبيق تفتحه بيومك؟' },
  { type: 'truth', text: 'وش رأيك الصريح بالشخص يمينك؟' },
  { type: 'truth', text: 'لو تقدر تلغي مادة/مهارة تعلمتها، وش تختار؟' },
  { type: 'truth', text: 'وش أكثر شي مسوي منه دراما بحياتك؟' },
  { type: 'truth', text: 'متى آخر مرة بكيت؟' },
  { type: 'dare', text: 'قلد صوت حيوان لمدة 15 ثانية.' },
  { type: 'dare', text: 'ارقص رقصة مضحكة 20 ثانية.' },
  { type: 'dare', text: 'كلم الشخص يسارك بلهجة مصرية دقيقة كاملة.' },
  { type: 'dare', text: 'خلي أحد بالمجموعة يرسم على وجهك بالقلم (وهمي إذا ما فيه قلم).' },
  { type: 'dare', text: 'غني أول أغنية توصل بالك.' },
  { type: 'dare', text: 'سو صوت ضحكة غريبة قدام الكل.' },
  { type: 'dare', text: 'امشي مثل البطريق حول المكان.' },
  { type: 'dare', text: 'قلد أحد المشاهير وخلي المجموعة يخمنون مين.' },
  { type: 'dare', text: 'احك نكتة بصوت عالي وخليك جدي وأنت تحكيها.' },
  { type: 'dare', text: 'اطلب من المجموعة يعطونك تحدي ثاني وسويه فورًا.' },
  { type: 'dare', text: 'تكلم بدون ما تستخدم حرف الألف لمدة دقيقة.' },
  { type: 'dare', text: 'سو تمثيلية قصيرة عن أسوأ يوم بحياتك.' },
  { type: 'dare', text: 'خلي كل واحد بالمجموعة يعطيك أمر بسيط وسويه.' },
  { type: 'dare', text: 'تكلم مثل روبوت لمدة 30 ثانية.' },
  { type: 'dare', text: 'سو حركة يوغا غريبة وثبت عليها 10 ثواني.' },
  { type: 'dare', text: 'اعمل تعليق رياضي مثير لشي عادي يصير الحين بالغرفة.' },
  { type: 'dare', text: 'قول الأبجدية بالمقلوب بأسرع وقت.' },
  { type: 'dare', text: 'اطلع صورة سيلفي بأغرب تعبير وجه.' },
  { type: 'dare', text: 'سو دقيقة كوميدي ستاند-أب مرتجل.' },
  { type: 'dare', text: 'قلد طريقة مشي حد بالمجموعة.' },
]

export function pickRoundKey(recentKeys = []) {
  const available = PROMPTS.map((_, i) => i).filter((i) => !recentKeys.includes(i))
  const idxPool = available.length ? available : PROMPTS.map((_, i) => i)
  return idxPool[Math.floor(Math.random() * idxPool.length)]
}

export function getRoundData(key) {
  return PROMPTS[key]
}

export function checkAnswer() {
  return true
}

export function revealAnswer(key) {
  return PROMPTS[key].text
}
