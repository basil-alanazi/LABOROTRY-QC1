/** @type {import('tailwindcss').Config} */
// Warm "Claude-style" theme: cream backgrounds, warm greys and a clay accent.
// The app's classes still say teal-* / slate-* everywhere — those names are
// remapped here, so the whole site changes colour without touching pages.
const clay = {
  50: "#FBF3EE",
  100: "#F6E3D9",
  200: "#EEC7B4",
  300: "#E3A487",
  400: "#D97757",
  500: "#C96442",
  600: "#B4553A",
  700: "#954530",
  800: "#783826",
  900: "#5E2C1E",
  950: "#341810",
};
const warm = {
  50: "#F5F4ED",
  100: "#EEECE2",
  200: "#E3E0D5",
  300: "#CFCBBE",
  400: "#A9A497",
  500: "#878276",
  600: "#66625A",
  700: "#4A4740",
  800: "#33312C",
  900: "#22211E",
  950: "#141412",
};
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        teal: clay,
        slate: warm,
        white: "#FFFEFB",
      },
    },
  },
  plugins: [],
};
