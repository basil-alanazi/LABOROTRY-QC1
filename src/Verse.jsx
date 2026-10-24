// الآية: سورة الإسراء ٢٤
export const VERSE = "وَاخْفِضْ لَهُمَا جَنَاحَ الذُّلِّ مِنَ الرَّحْمَةِ وَقُلْ رَبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا";

export function Verse({ className = "" }) {
  return (
    <figure className={`verse ${className}`}>
      <blockquote>﴿{VERSE}﴾</blockquote>
      <figcaption>سورة الإسراء، الآية ٢٤</figcaption>
    </figure>
  );
}

// خلفية هادية خلف كل الصفحات
export function VerseBackground() {
  return (
    <div className="verse-bg" aria-hidden="true">
      <span>﴿{VERSE}﴾</span>
    </div>
  );
}
