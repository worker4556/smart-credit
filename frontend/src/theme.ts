import { createTheme, type PaletteMode } from "@mui/material";

// Цвета поверхностей и текста берутся из CSS-переменных (styles.css), поэтому светлая и тёмная тема
// переключаются атрибутом data-theme на <html>, а MUI только знает режим для своих состояний.
export function makeTheme(mode: PaletteMode) {
  const dark = mode === "dark";
  return createTheme({
    palette: {
      mode,
      primary: { main: "#E02A1D", dark: "#C51F16" },
      secondary: { main: "#A8EF00" },
      background: { default: dark ? "#0C0C0E" : "#F1F1F1", paper: dark ? "#16161A" : "#FFFFFF" },
      text: { primary: dark ? "#F1F1F3" : "#111111", secondary: dark ? "#9B9BA4" : "#626262" },
      divider: dark ? "#2A2A31" : "#E4E4E7",
    },
    shape: { borderRadius: 16 },
    typography: {
      fontFamily: '"Alfa Sans", Manrope, "Segoe UI", Arial, sans-serif',
      button: { textTransform: "none", fontWeight: 700 },
      h1: { fontWeight: 800, letterSpacing: "-.045em" },
      h2: { fontWeight: 800, letterSpacing: "-.04em" },
      h3: { fontWeight: 800, letterSpacing: "-.035em" },
      h4: { fontWeight: 800, letterSpacing: "-.03em" },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 12, padding: "12px 20px", boxShadow: "none", transition: "transform .15s ease, box-shadow .25s ease, background-color .2s ease" },
          contained: { boxShadow: "none", "&:active": { transform: "scale(.98)" } },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: { borderRadius: 18, boxShadow: "var(--shadow-1)", border: "1px solid var(--line)", backgroundColor: "var(--surface)", backgroundImage: "none" },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
          rounded: { borderRadius: 18 },
        },
      },
      MuiSlider: {
        styleOverrides: {
          root: { color: "#E02A1D" },
          thumb: { width: 20, height: 20 },
        },
      },
    },
  });
}
