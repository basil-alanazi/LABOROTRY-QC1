# 🎉 جمعتنا — اللعبة تجمعنا

منصة ألعاب اجتماعية عربية. تبدأ بلعبة **كلمات مقلوبة**، لكن مبنية من الأساس كنظام ألعاب قابل للتوسع — كل لعبة جديدة تُضاف كـ Module مستقل بدون التأثير على بقية النظام.

## المكدّس التقني

- **React + Vite** — الواجهة
- **Tailwind CSS v4** — نظام تصميم موحّد (Design tokens عبر CSS variables، Dark Mode بتبديل كلاس واحد)
- **React Router** — التنقل بين الصفحات
- **Framer Motion** — الحركات (card hover, feedback, celebrations...)
- **Supabase** — تسجيل الدخول (Auth) + قاعدة البيانات (Postgres) + الجلسات اللحظية (Realtime)

## البنية المعمارية — نظام الألعاب

```
src/games/
├── registry.js          ← سجل الألعاب المتاحة (نقطة الإضافة الوحيدة)
└── reversed-words/       ← أول لعبة (كل لعبة = مجلد مستقل)
    ├── index.js          ← البيانات الوصفية (اسم/أيقونة/قواعد نقاط...)
    ├── logic.js           ← منطق اللعبة (توليد الجولة، فحص الإجابة)
    └── GameScreen.jsx     ← واجهة اللعب المخصصة لها
```

### إضافة لعبة جديدة

1. أنشئ مجلد `src/games/<game-id>/`
2. اكتب `logic.js` بأربع دوال: `pickRoundKey`, `getRoundData`, `checkAnswer`, `revealAnswer`
3. اكتب `GameScreen.jsx` تستقبل `{roundIndex, totalRounds, timeLeft, roundData, phase, resultInfo, onSubmitGuess, onExit}`
4. صدّر كل شي من `index.js` مع البيانات الوصفية
5. أضفها إلى `src/games/registry.js`
6. أضف صف لها في جدول `games` في Supabase (بدون أي تعديل SQL آخر)

نظام الجلسات (`useGameSession`) والـ Lobby والنتائج والـ Leaderboard كلها عامة (game-agnostic) — تشتغل مع أي لعبة تتبع نفس الواجهة تلقائيًا.

## قاعدة البيانات (Supabase)

الجداول: `profiles`, `friendships`, `games`, `game_sessions`, `session_players`, `game_results` — جميعها بصلاحيات Row Level Security. تسجيل الدخول بالبريد أو اسم المستخدم (عبر دالة `get_email_for_username`) أو رقم الجوال (OTP).

> **ملاحظة:** الدخول السريع برقم الجوال يحتاج تفعيل مزوّد SMS (مثل Twilio) من لوحة تحكم Supabase → Authentication → Providers → Phone. بدون هذا الإعداد ستفشل خطوة إرسال الرمز.

## التشغيل محليًا

```bash
cd word-game
cp .env.example .env   # وحط فيه بيانات مشروع Supabase
npm install
npm run dev
```

## النشر (Vercel)

Root Directory: `word-game` — Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## PWA

تقدر تثبت الموقع كتطبيق من المتصفح (Add to Home Screen) على آيفون وأندرويد.
