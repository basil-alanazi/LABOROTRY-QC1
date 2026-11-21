/** @type {import('tailwindcss').Config} */
// Warm cream theme with a soft copper accent. The app's classes still say
// teal-* / slate-* everywhere — those names are remapped here, so the whole
// site changes colour without touching pages.
const copper = {
  50: "#FBF4EE",
  100: "#F5E6DA",
  200: "#EBCBB4",
  300: "#DDA886",
  400: "#CB8660",
  500: "#BC7049",
  600: "#AD6340",
  700: "#8F4F33",
  800: "#723F29",
  900: "#5A3221",
  950: "#321B11",
};
const warm = {
  50: "#FAF6F0",
  100: "#F3ECE3",
  200: "#E9E0D4",
  300: "#D8CDBF",
  400: "#A99D8F",
  500: "#867969",
  600: "#675A4D",
  700: "#4C4138",
  800: "#352C25",
  900: "#251E19",
  950: "#16110E",
};
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        teal: copper,
        slate: warm,
        white: "#FFFDF9",
      },
      fontFamily: {
        serif: ['"Lora"', "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
