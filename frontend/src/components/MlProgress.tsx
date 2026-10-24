import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import CheckCircle from "@mui/icons-material/CheckCircle";

export type MlRun = "precheck" | "decision";

// Пока движок считает, клиент видит, что именно проверяется: 9 факторов балльной карты (ml/config/policy.yaml),
// затем стоп-факторы и порог одобрения. Баллы здесь не показываем — они придут в самом решении.
const factors: Array<[string, number]> = [
  ["Регулярность оборотов", 20],
  ["Долговая нагрузка", 15],
  ["Кредитная история", 15],
  ["Возраст бизнеса", 10],
  ["Сумма к обороту", 10],
  ["Личная нагрузка владельца", 10],
  ["Отрасль", 8],
  ["Суды и ФССП", 7],
  ["Срок счёта в банке", 5],
];
const runs: Record<MlRun, { title: string; history: string }> = {
  precheck: { title: "Считаем предварительную оценку", history: "со слов" },
  decision: { title: "Банк принимает решение", history: "по БКИ" },
};
const STEP_MS = 190;

export default function MlProgress({ run }: { run: MlRun | null }) {
  const [checked, setChecked] = useState(0);

  useEffect(() => {
    if (!run) return;
    setChecked(0);
    const timer = window.setInterval(() => setChecked((current) => Math.min(current + 1, factors.length + 2)), STEP_MS);
    return () => window.clearInterval(timer);
  }, [run]);

  if (!run) return null;
  const { title, history } = runs[run];
  const stopsDone = checked > factors.length;
  return (
    <Box className="ml-overlay" role="status" aria-live="polite">
      <Box className="ml-panel">
        <Typography className="ml-eyebrow">Движок одобрения · балльная карта</Typography>
        <Typography className="ml-title">{title}</Typography>
        <Box className="ml-factors">
          {factors.map(([label, max], i) => (
            <Box key={label} className={`ml-factor ${i < checked ? "done" : i === checked ? "active" : ""}`}>
              <span className="ml-factor-dot">{i < checked && <CheckCircle />}</span>
              <span className="ml-factor-label">{label}{label === "Кредитная история" ? ` · ${history}` : ""}</span>
              <span className="ml-factor-max">до {max}</span>
              <span className="ml-factor-bar"><i /></span>
            </Box>
          ))}
        </Box>
        <Box className="ml-gates">
          <Box className={`ml-gate ${stopsDone ? "done" : checked === factors.length ? "active" : ""}`}><span className="ml-factor-dot">{stopsDone && <CheckCircle />}</span>Стоп-факторы</Box>
          <Box className={`ml-gate ${checked > factors.length + 1 ? "done" : stopsDone ? "active" : ""}`}><span className="ml-factor-dot">{checked > factors.length + 1 && <CheckCircle />}</span>Порог одобрения — 70 из 100</Box>
        </Box>
        <Typography className="ml-note">Решение принимают правила банка. Языковая модель в нём не участвует.</Typography>
      </Box>
    </Box>
  );
}
