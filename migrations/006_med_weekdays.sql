-- أدوية بأيام محددة في الأسبوع (مثل فيتامين د كل جمعة). فاضي = كل يوم
ALTER TABLE medications ADD COLUMN weekdays TEXT;  -- JSON: [0..6]، 0 = الأحد
