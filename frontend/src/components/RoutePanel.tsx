import { useState } from "react";
import { Box, Button, CircularProgress, IconButton, Typography } from "@mui/material";
import ArrowForward from "@mui/icons-material/ArrowForward";
import ChatBubbleOutline from "@mui/icons-material/ChatBubbleOutline";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Close from "@mui/icons-material/Close";
import HourglassEmpty from "@mui/icons-material/HourglassEmpty";
import type { ApplicationData, RouteStep } from "../types";
import { formatMoney } from "../utils/format";
import { reasonTone, toneLabel, WAIT_CODES } from "../utils/route";

// Маршрут к вершине живёт на главной: панель по разделам — где вы, что сделать, ориентир, чего не делать.
// Отметка шага сразу пересчитывает маршрут (без заявки и без бюро кредитных историй) — docs/route-pages.md
interface RoutePanelProps {
  data: ApplicationData;
  available: number;
  onClose: () => void;
  recalculateRoute: (doneSteps: string[]) => Promise<void>;
  onNewApplication: () => void;
  onHelp: () => void;
  onContinue?: () => void;
}

export default function RoutePanel({ data, available, onClose, recalculateRoute, onNewApplication, onHelp, onContinue }: RoutePanelProps) {
  const [saving, setSaving] = useState<string | null>(null);
  const route = data.route;
  const draft = data.status === "DRAFT" || !data.submitted;
  const basis = draft ? "по предварительной оценке" : route?.basedOn === "SPECIALIST" ? "по решению специалиста банка" : "по решению банка";

  const toggle = async (step: RouteStep, checked: boolean) => {
    const done = new Set((route?.steps ?? []).filter((s) => s.done).map((s) => s.code));
    if (checked) done.add(step.code); else done.delete(step.code);
    setSaving(step.code);
    try { await recalculateRoute([...done]); } finally { setSaving(null); }
  };

  const head = <Box className="rp-head">
    <Box><Typography component="h2" className="rp-title">Маршрут к вершине</Typography><Typography className="rp-basis">Построен {basis}</Typography></Box>
    <IconButton onClick={onClose} aria-label="Свернуть маршрут"><Close /></IconButton>
  </Box>;

  if (!route) return <Box className="rp">{head}<Box className="rp-loading"><CircularProgress size={18} /> Строим маршрут…</Box></Box>;

  const noRoute = route.status === "NO_ROUTE" || route.holds === "STOP_PERMANENT";
  const ready = route.status === "READY";
  const progress = data.amount > 0 ? Math.min(available / data.amount, 1) : 0;

  return <Box className="rp">
    {head}

    <Box component="section" className="rp-section rp-where">
      <Typography className="rp-label">Где вы</Typography>
      <Box className="rp-heights">
        <Box><small>Доступно сейчас</small><b>{formatMoney(available)}</b></Box>
        <Box className="rp-arrow" aria-hidden="true" />
        <Box><small>Вершина</small><b>{formatMoney(data.amount)}</b></Box>
      </Box>
      <Box className="rp-progress" aria-label={`Пройдено ${Math.round(progress * 100)}% пути`}><i style={{ transform: `scaleX(${progress})` }} /></Box>
    </Box>

    <Box component="section" className="rp-section rp-todo">
      <Typography className="rp-label">{noRoute ? "Маршрута нет" : "Что сделать"}</Typography>
      {noRoute
        ? <Typography className="rp-text">К этому продукту сейчас нет пути. Можно подобрать другой вариант или спросить помощника.</Typography>
        : <Box className="rp-steps">
            {route.steps.map((step) => {
              const tone = reasonTone(step.code, `${step.term} ${step.action}`);
              const wait = WAIT_CODES.has(step.code);
              return <Box component="label" key={step.code} className={`rp-step tone-${tone}${step.done ? " done" : ""}${wait ? " wait" : ""}`}>
                {wait
                  ? <span className="rp-check" aria-hidden="true"><HourglassEmpty /></span>
                  : <input type="checkbox" className="rp-input" checked={step.done} disabled={saving !== null}
                      onChange={(e) => void toggle(step, e.target.checked)} />}
                {!wait && <span className="rp-check" aria-hidden="true">{step.done && <CheckCircle />}</span>}
                <span className="rp-step-body">
                  <b>{step.action}{step.targetTurnover ? ` — до ${formatMoney(step.targetTurnover)} в месяц` : ""}</b>
                  <small>{wait ? "дождаться · " : ""}{step.term}{step.pointsGain ? ` · +${step.pointsGain} к оценке` : ""}</small>
                  {step.bkiDelayBusinessDays ? <small>Бюро обновит данные за {step.bkiDelayBusinessDays} рабочих дня</small> : null}
                </span>
                {saving === step.code ? <CircularProgress size={14} /> : <span className="rp-tag">{toneLabel[tone]}</span>}
              </Box>;
            })}
          </Box>}
    </Box>

    {!noRoute && <Box component="section" className="rp-section rp-goal">
      <Typography className="rp-label">Ориентир</Typography>
      <Typography className="rp-horizon">{route.horizonText}</Typography>
      {route.projectedAmount != null && <Typography className="rp-text">После всех шагов — около {formatMoney(route.projectedAmount)}{route.projectedAmount >= data.amount ? ", вершина доступна" : ""}.</Typography>}
      <Typography className="rp-fine">{route.disclaimer ?? "Это ориентир при текущем темпе, а не обещание одобрения."}</Typography>
    </Box>}

    {(route.advice ?? []).length > 0 && <Box component="section" className="rp-section rp-avoid">
      <Typography className="rp-label">Чего не делать</Typography>
      {(route.advice ?? []).map((tip) => <Typography key={tip} className="rp-text rp-dont">{tip}</Typography>)}
    </Box>}

    {/* Что дальше: маршрут пройден — новая заявка с учётом шагов; иначе — вернуться к заявке. Отметки сохраняются сами */}
    <Box className="rp-actions">
      <Typography className="rp-next">
        {ready ? "Шаги выполнены — подайте новую заявку: банк пересчитает оценку с их учётом." : "Отметки сохраняются автоматически — можно вернуться к маршруту в любой момент."}
      </Typography>
      <Box className="rp-buttons">
        <Button variant="text" startIcon={<ChatBubbleOutline />} onClick={onHelp}>Спросить помощника</Button>
        {onContinue && !ready && <Button variant="outlined" onClick={onContinue}>К заявке</Button>}
        {ready && <Button variant="contained" endIcon={<ArrowForward />} onClick={onNewApplication}>Подать новую заявку</Button>}
      </Box>
    </Box>
  </Box>;
}
