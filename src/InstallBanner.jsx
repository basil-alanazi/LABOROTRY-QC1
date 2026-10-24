import { useEffect, useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";

const KEY = "wad_install_hidden";
const hidden = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
const hide = () => { try { localStorage.setItem(KEY, "1"); } catch { /* التخزين مقفل */ } };

// مفتوح كتطبيق (من الشاشة الرئيسية)؟
export const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isSafari = () => /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

// اقتراح تثبيت ود كتطبيق: خطوات للآيفون، وزر للأندرويد
export default function InstallBanner() {
  const [androidPrompt, setAndroidPrompt] = useState(null);
  const [closed, setClosed] = useState(hidden);

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setAndroidPrompt(e); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (closed || standalone()) return null;
  const close = () => { hide(); setClosed(true); };
  const ios = isIOS();
  if (!ios && !androidPrompt) return null;

  return (
    <div className="install-banner">
      <button className="install-x" onClick={close} aria-label="إخفاء"><X size={18} /></button>
      <img src="/icon-192.png" alt="" width="52" height="52" />
      <div className="install-body">
        <b>ثبّت ود كتطبيق</b>
        {ios ? (
          isSafari() ? (
            <ol>
              <li>اضغط زر المشاركة <Share size={16} /> تحت</li>
              <li>اختر "إضافة إلى الشاشة الرئيسية" <SquarePlus size={16} /></li>
              <li>افتح ود من الأيقونة، وفعّل الإشعارات منها</li>
            </ol>
          ) : (
            <p>افتح الموقع من <b>Safari</b> عشان تقدر تثبته.</p>
          )
        ) : (
          <button className="primary" onClick={async () => { androidPrompt.prompt(); await androidPrompt.userChoice; setAndroidPrompt(null); }}>تثبيت</button>
        )}
      </div>
    </div>
  );
}
