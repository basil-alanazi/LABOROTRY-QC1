import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // xlsx + jspdf/jspdf-autotable pull in a genuinely large export toolchain;
  // raise the warning limit instead of chasing an unrealistic budget.
  build: {
    chunkSizeWarningLimit: 1500,
    // Some department PCs run old, unpatched browsers — target broadly
    // supported JS/CSS (still ES2015+, but well short of the latest
    // Chrome/Edge only default) instead of assuming a fully current browser.
    target: 'es2017',
  },
})
