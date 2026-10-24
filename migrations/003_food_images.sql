-- صور الأكلات اللي يولّدها الذكاء الاصطناعي (مشتركة، حسب وصف الأكلة)
CREATE TABLE IF NOT EXISTS food_images (
  k TEXT PRIMARY KEY,   -- SHA-256 لوصف الأكلة
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  image TEXT NOT NULL   -- data:image/jpeg;base64
);
