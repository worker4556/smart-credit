import { IconButton, Tooltip } from "@mui/material";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import type { PaletteMode } from "@mui/material";

export default function ThemeToggle({ mode, onToggle, className = "" }: { mode: PaletteMode; onToggle: () => void; className?: string }) {
  const label = mode === "dark" ? "Включить светлую тему" : "Включить тёмную тему";
  return (
    <Tooltip title={label}>
      <IconButton className={`theme-toggle ${className}`} onClick={onToggle} aria-label={label}>
        <span className={`theme-toggle-icon ${mode}`} key={mode}>{mode === "dark" ? <LightModeOutlined /> : <DarkModeOutlined />}</span>
      </IconButton>
    </Tooltip>
  );
}
