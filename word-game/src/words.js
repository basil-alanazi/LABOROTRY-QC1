// بنك الكلمات: عربي وإنجليزي مخلوطين
export const WORDS = [
  // عربي - عام
  'قلم', 'كتاب', 'شمس', 'قمر', 'بحر', 'جبل', 'نهر', 'شجرة', 'زهرة', 'طائر',
  'سيارة', 'طائرة', 'قطار', 'بيت', 'مدرسة', 'مستشفى', 'مطبخ', 'حديقة', 'مكتبة', 'ملعب',
  'تفاح', 'موز', 'برتقال', 'عنب', 'فراولة', 'خبز', 'حليب', 'عسل', 'قهوة', 'شاي',
  'قطة', 'كلب', 'أسد', 'نمر', 'فيل', 'حصان', 'أرنب', 'سمكة', 'دجاجة', 'بقرة',
  'مفتاح', 'باب', 'نافذة', 'كرسي', 'طاولة', 'ساعة', 'هاتف', 'حاسوب', 'شاشة', 'كاميرا',
  'صيف', 'شتاء', 'ربيع', 'خريف', 'مطر', 'ثلج', 'ريح', 'غيم', 'نجمة', 'سماء',
  'معلم', 'طبيب', 'مهندس', 'طيار', 'شرطي', 'طباخ', 'فنان', 'كاتب', 'رياضي', 'ممرض',
  'مختبر', 'تحليل', 'عينة', 'جهاز', 'أنبوب', 'ميكروسكوب', 'قفازات', 'كمامة', 'نتيجة', 'تقرير',
  // English - general
  'apple', 'orange', 'banana', 'grape', 'lemon', 'mango', 'cherry', 'melon', 'peach', 'berry',
  'house', 'garden', 'school', 'bridge', 'castle', 'forest', 'island', 'desert', 'valley', 'river',
  'guitar', 'piano', 'violin', 'trumpet', 'drum', 'flute', 'camera', 'laptop', 'tablet', 'phone',
  'tiger', 'lion', 'eagle', 'dolphin', 'rabbit', 'turtle', 'monkey', 'penguin', 'zebra', 'panda',
  'planet', 'galaxy', 'rocket', 'comet', 'meteor', 'star', 'moon', 'orbit', 'cloud', 'storm',
  'doctor', 'teacher', 'pilot', 'artist', 'writer', 'nurse', 'farmer', 'singer', 'lawyer', 'chef',
  'sample', 'result', 'report', 'device', 'pipette', 'gloves', 'reagent', 'analyzer', 'control', 'quality',
]

const RTL_REGEX = /[؀-ۿ]/

export function isArabic(word) {
  return RTL_REGEX.test(word)
}

export function scramble(word) {
  const letters = Array.from(word)
  if (letters.length < 2) return word
  let shuffled = letters
  let attempts = 0
  do {
    shuffled = [...letters]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    attempts++
  } while (shuffled.join('') === letters.join('') && attempts < 10)
  return shuffled.join('')
}

export function normalize(str) {
  return str.trim().toLowerCase().replace(/[ً-ْ]/g, '')
}

// يرجع كلمة عشوائية غير مكررة عن آخر N كلمات
export function pickWord(recentIds = []) {
  const available = WORDS.map((_, i) => i).filter((i) => !recentIds.includes(i))
  const pool = available.length ? available : WORDS.map((_, i) => i)
  const id = pool[Math.floor(Math.random() * pool.length)]
  return { id, word: WORDS[id] }
}
