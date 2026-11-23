import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { useLanguage } from "../lib/i18n.jsx";

// Full-screen camera view that reads one barcode (Code 128 labels, QR, etc.)
// and hands the text to onResult. Uses the back camera on phones.
export default function BarcodeScannerModal({ title, onResult, onClose }) {
  const { t } = useLanguage();
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls;
    reader
      .decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, videoRef.current, (result, _err, ctl) => {
        controls = ctl;
        if (result && !doneRef.current) {
          doneRef.current = true;
          if (navigator.vibrate) navigator.vibrate(80);
          ctl.stop();
          onResult(result.getText());
        }
      })
      .then((ctl) => {
        controls = ctl;
      })
      .catch((err) => setError(err?.name === "NotAllowedError" ? t("Camera permission was refused. Allow the camera for this site and try again.") : t("Could not open the camera.")));
    return () => {
      doneRef.current = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 p-4">
      <div className="mb-3 flex items-center justify-between text-white">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Camera className="h-4 w-4" />
          {title || t("Scan barcode")}
        </p>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label={t("Close")}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative mx-auto w-full max-w-md flex-1 overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80" />
      </div>
      <p className="mt-3 text-center text-xs text-white/70">{error || t("Hold the label inside the box.")}</p>
    </div>
  );
}
