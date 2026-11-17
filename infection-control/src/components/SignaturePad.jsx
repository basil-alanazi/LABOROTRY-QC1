import { forwardRef, useImperativeHandle, useRef, useState } from "react";

// A small reusable canvas signature pad. Captures the pointer on
// pointerdown so a stroke that drifts past the canvas's edge (an easy,
// normal part of signing) keeps being tracked until pointerup, instead of
// silently stopping — see RefusalFormModal for the same fix applied there.
const SignaturePad = forwardRef(function SignaturePad({ className = "" }, ref) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  function canvasPoint(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
  }
  function handlePointerDown(e) {
    e.preventDefault();
    drawingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current.getContext("2d");
    const p = canvasPoint(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function handlePointerMove(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = canvasPoint(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasSignature(true);
  }
  function handlePointerUp(e) {
    drawingRef.current = false;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  useImperativeHandle(ref, () => ({
    hasSignature: () => hasSignature,
    clear,
    toBlob: () => new Promise((resolve) => canvasRef.current.toBlob(resolve, "image/png")),
  }));

  return (
    <canvas
      ref={canvasRef}
      width={560}
      height={160}
      className={`w-full touch-none rounded-lg border border-dashed border-slate-300 bg-slate-50 ${className}`}
      style={{ cursor: "crosshair" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
});

export default SignaturePad;
