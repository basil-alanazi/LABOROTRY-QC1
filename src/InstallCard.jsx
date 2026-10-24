import { useEffect, useState } from "react";
import { Share, SquarePlus } from "lucide-react";

// مفتوح كتطبيق (من الشاشة الرئيسية)؟
export const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/.test(navigator.userAgent);
const isSafari = () => /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

// المتصفح يرسل عرض التثبيت مرة وحدة أول ما يفتح الموقع، فنمسكه من البداية
let savedPrompt = null;
const listeners = new Set();
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  savedPrompt = e;
  listeners.forEach((fn) => fn(e));
});

// طرق تثبيت ود كتطبيق (في صفحة العائلة)
export default function InstallCard() {
  const [prompt, setPrompt] = useState(savedPrompt);
  useEffect(() => { listeners.add(setPrompt); return () => listeners.delete(setPrompt); }, []);

  const ios = isIOS(), android = isAndroid();

  async function install() {
    prompt.prompt();
    await prompt.userChoice;
    savedPrompt = null;
    setPrompt(null);
  }

  return (
    <div className="card install-card">
      <h3>📱 ثبّت ود كتطبيق</h3>
      {standalone() && <p className="ok-line">✓ أنت فاتح ود كتطبيق الحين.</p>}

      {!android && (
        <div className="install-way">
          <b>الآيفون</b>
          {ios && !isSafari() ? (
            <p>افتح الموقع من <b>Safari</b> عشان تقدر تثبته.</p>
          ) : (
            <ol>
              <li>افتح الموقع من Safari، واضغط زر المشاركة <Share size={16} /></li>
              <li>اختر "إضافة إلى الشاشة الرئيسية" <SquarePlus size={16} /></li>
              <li>افتح ود من الأيقونة، وفعّل الإشعارات منها</li>
            </ol>
          )}
        </div>
      )}

      {!ios && (
        <div className="install-way">
          <b>الأندرويد</b>
          {prompt && <button className="primary" onClick={install}>تثبيت بضغطة وحدة</button>}
          <a className="app-dl" href="/wad.apk" download>تحميل ملف التطبيق (APK)</a>
          <p className="hint">بعد التحميل افتح الملف، ولو طلب "السماح بالتثبيت من هالمصدر" وافق عليه.</p>
        </div>
      )}
    </div>
  );
}
