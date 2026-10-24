import { useCallback, useEffect, useState } from "react";
import type { PaletteMode } from "@mui/material";

const KEY = "credit-color-mode";

function initialMode(): PaletteMode {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // хранилище недоступно — берём системную тему
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Тема кабинета: выбор клиента сохраняется, по умолчанию — как в системе
export function useColorMode() {
  const [mode, setMode] = useState<PaletteMode>(initialMode);
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try { localStorage.setItem(KEY, mode); } catch { /* не критично */ }
  }, [mode]);
  const toggle = useCallback(() => setMode((current) => (current === "dark" ? "light" : "dark")), []);
  return { mode, toggle };
}
