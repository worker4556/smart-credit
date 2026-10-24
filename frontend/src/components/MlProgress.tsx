import { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import CheckCircle from "@mui/icons-material/CheckCircle";
import NeuralParse, { type NeuralParseHandle } from "./NeuralParse";

export type MlRun = "precheck" | "decision";

// Пока ML считает предоценку или решение, клиент видит, что именно проверяется.
// Этапы — это реальные шаги движка правил (ml/README.md), а не прогресс запроса: время у них условное.
const runs: Record<MlRun, { title: string; stages: string[] }> = {
  precheck: { title: "Считаем предварительную оценку", stages: ["Компания и обороты", "9 факторов скоринга", "Лимит, ставка, платёж", "Подбираем предложения"] },
  decision: { title: "Банк принимает решение", stages: ["Данные и документы", "Кредитная история", "Баллы по 9 факторам", "Правила решения"] },
};
const colors = ["#ffffff", "#ffffff", "#ff5a4e", "#4cd38a"];

export default function MlProgress({ run }: { run: MlRun | null }) {
  const [stage, setStage] = useState(0);
  const netRef = useRef<NeuralParseHandle>(null);

  useEffect(() => {
    if (!run) return;
    setStage(0);
    const stages = runs[run].stages.length;
    const ticker = window.setInterval(() => setStage((current) => Math.min(current + 1, stages - 1)), 560);
    const pulses = window.setInterval(() => netRef.current?.fire(Math.floor(Math.random() * 9), colors[Math.floor(Math.random() * colors.length)]), 130);
    return () => { window.clearInterval(ticker); window.clearInterval(pulses); };
  }, [run]);

  if (!run) return null;
  const { title, stages } = runs[run];
  return (
    <Box className="ml-overlay" role="status" aria-live="polite">
      <Box className="ml-panel">
        <Typography className="ml-eyebrow">ДВИЖОК ОДОБРЕНИЯ</Typography>
        <Typography className="ml-title">{title}</Typography>
        <Box className="ml-net"><NeuralParse ref={netRef} inputs={9} /></Box>
        <Box className="ml-stages">
          {stages.map((label, i) => (
            <Box key={label} className={`ml-stage ${i < stage ? "done" : i === stage ? "active" : ""}`}>
              <span className="ml-stage-dot">{i < stage ? <CheckCircle /> : null}</span>
              <span>{label}</span>
            </Box>
          ))}
        </Box>
        <Box className="ml-bar"><i style={{ transform: `scaleX(${(stage + 1) / stages.length})` }} /></Box>
        <Typography className="ml-note">Решение — по правилам банка. Языковая модель в нём не участвует.</Typography>
      </Box>
    </Box>
  );
}
