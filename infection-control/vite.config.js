import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // xlsx + jspdf/jspdf-autotable pull in a genuinely large export toolchain;
  // raise the warning limit instead of chasing an unrealistic budget.
  build: {
    chunkSizeWarningLimit: 1500,
  },
})
