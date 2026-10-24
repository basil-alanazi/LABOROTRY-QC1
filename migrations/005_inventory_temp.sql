-- جرد الأدوية، ودرجة الحرارة مع القياسات الحيوية
ALTER TABLE medications ADD COLUMN stock REAL;                          -- الكمية الباقية (فاضي = ما نتابع الجرد)
ALTER TABLE medications ADD COLUMN per_dose REAL NOT NULL DEFAULT 1;    -- كم ينقص مع كل جرعة
ALTER TABLE medications ADD COLUMN unit TEXT;                           -- حبة، قطرة، إبرة...
ALTER TABLE medications ADD COLUMN alert_days INTEGER NOT NULL DEFAULT 7; -- ينبّه قبل ما يخلص بكم يوم
ALTER TABLE bp_readings ADD COLUMN temp REAL;                           -- درجة الحرارة °C
