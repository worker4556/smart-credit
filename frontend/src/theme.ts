import { createTheme } from "@mui/material";

const theme = createTheme({
  palette: {
    primary: { main: "#E02A1D", dark: "#C51F16" },
    secondary: { main: "#A8EF00" },
    background: { default: "#F1F1F1", paper: "#FFFFFF" },
    text: { primary: "#111111", secondary: "#626262" },
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: '"Alfa Sans", "Segoe UI", Arial, sans-serif',
    button: { textTransform: "none", fontWeight: 700 },
    h1: { fontWeight: 800, letterSpacing: "-.045em" },
    h2: { fontWeight: 800, letterSpacing: "-.04em" },
    h3: { fontWeight: 800, letterSpacing: "-.035em" },
    h4: { fontWeight: 800, letterSpacing: "-.03em" },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 13, padding: "12px 20px", boxShadow: "none" },
        contained: { boxShadow: "none" },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 18,
          boxShadow: "none",
          border: "1px solid #E3E3E3",
        },
      },
    },
    MuiPaper: { styleOverrides: { rounded: { borderRadius: 18 } } },
    MuiSlider: {
      styleOverrides: {
        root: { color: "#E02A1D" },
        thumb: { width: 20, height: 20 },
      },
    },
  },
});

export default theme;
