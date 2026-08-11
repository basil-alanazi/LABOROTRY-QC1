import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Splits big third-party libraries into their own chunks instead of one
// giant app bundle. Doesn't change what loads on first visit, but these
// chunks change far less often than the app code — browsers keep them
// cached across deploys instead of re-downloading everything every time.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          supabase: ["@supabase/supabase-js"],
          charts: ["recharts"],
          icons: ["lucide-react"],
          xlsx: ["xlsx"],
          mammoth: ["mammoth"],
        },
      },
    },
  },
});
