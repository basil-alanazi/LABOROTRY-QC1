let ctx = null

function getCtx() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(audioCtx, freq, startAt, duration, gain = 0.18) {
  const osc = audioCtx.createOscillator()
  const g = audioCtx.createGain()
  osc.type = 'triangle'
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, startAt)
  g.gain.linearRampToValueAtTime(gain, startAt + 0.02)
  g.gain.exponentialRampToValueAtTime(0.001, startAt + duration)
  osc.connect(g)
  g.connect(audioCtx.destination)
  osc.start(startAt)
  osc.stop(startAt + duration)
}

export function playUnoChime() {
  const audioCtx = getCtx()
  if (!audioCtx) return
  const now = audioCtx.currentTime
  tone(audioCtx, 523.25, now, 0.14) // C5
  tone(audioCtx, 659.25, now + 0.1, 0.14) // E5
  tone(audioCtx, 784.0, now + 0.2, 0.28) // G5
}

let arabicVoice = null
let voicesReady = false

function pickArabicVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  voicesReady = true
  return voices.find((v) => v.lang?.toLowerCase().startsWith('ar')) || null
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  arabicVoice = pickArabicVoice()
  window.speechSynthesis.onvoiceschanged = () => {
    arabicVoice = pickArabicVoice()
  }
}

export function speakUno() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  if (!voicesReady) arabicVoice = pickArabicVoice()
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance('أونو!')
  u.lang = arabicVoice?.lang || 'ar-SA'
  if (arabicVoice) u.voice = arabicVoice
  u.rate = 1.05
  u.pitch = 1.15
  u.volume = 1
  window.speechSynthesis.speak(u)
}

export function playFlipChime() {
  const audioCtx = getCtx()
  if (!audioCtx) return
  const now = audioCtx.currentTime
  tone(audioCtx, 392.0, now, 0.16, 0.15) // G4
  tone(audioCtx, 261.63, now + 0.13, 0.24, 0.15) // C4
}

function toneSlide(audioCtx, fromFreq, toFreq, startAt, duration, gain = 0.18) {
  const osc = audioCtx.createOscillator()
  const g = audioCtx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(fromFreq, startAt)
  osc.frequency.exponentialRampToValueAtTime(toFreq, startAt + duration)
  g.gain.setValueAtTime(0, startAt)
  g.gain.linearRampToValueAtTime(gain, startAt + 0.03)
  g.gain.exponentialRampToValueAtTime(0.001, startAt + duration)
  osc.connect(g)
  g.connect(audioCtx.destination)
  osc.start(startAt)
  osc.stop(startAt + duration)
}

export function playLaughChime() {
  const audioCtx = getCtx()
  if (!audioCtx) return
  const now = audioCtx.currentTime
  toneSlide(audioCtx, 320, 170, now, 0.32, 0.16)
}

export function playStrongLaughChime() {
  const audioCtx = getCtx()
  if (!audioCtx) return
  const now = audioCtx.currentTime
  toneSlide(audioCtx, 360, 160, now, 0.28, 0.18)
  toneSlide(audioCtx, 320, 120, now + 0.26, 0.34, 0.2)
  toneSlide(audioCtx, 280, 90, now + 0.56, 0.4, 0.2)
}
