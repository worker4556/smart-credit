import { useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Typography } from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ArrowForward from "@mui/icons-material/ArrowForward";
import ChatBubbleOutline from "@mui/icons-material/ChatBubbleOutline";
import Flag from "@mui/icons-material/Flag";
import { MountainRoute, useMetrics } from "./LandingPage";
import type { ApplicationData, RouteStep } from "../types";
import { formatMoney } from "../utils/format";
import { reasonTone, toneLabel } from "../utils/route";

// Р3 «Маршрут к одобрению» — docs/route-pages.md, раздел 3

interface RoutePageProps {
  data: ApplicationData;
  recalculateRoute: (doneSteps: string[]) => Promise<void>;
  onBack: () => void;
  onNewApplication: () => Promise<void>;
  onHelp: () => void;
}

// Что держит результат — подпись препятствия на карте (route.holds)
const HOLD_TEXT: Record<string, string> = {
  STOP: "Мешает стоп-фактор: без него маршрут не двигается",
  SCORE: "Не хватает баллов оценки",
  TURNOVER: "Баллы уже не мешают — сумму держит оборот",
  TIME_WINDOW: "Ограничение снимется только со временем",
  STOP_PERMANENT: "Это нельзя изменить действиями",
  NONE: "Препятствий нет",
};

// Шаги-ожидания: их нельзя «выполнить» отметкой, только дождаться
const WAIT_CODES = new Set(["S_90_12", "S_AGE", "B_AGE"]);

export default function RoutePage({ data, recalculateRoute, onBack, onNewApplication, onHelp }: RoutePageProps) {
  const metrics = useMetrics(data);
  const [saving, setSaving] = useState<string | null>(null);
  const route = data.route;
  const draft = data.status === "DRAFT" || !data.submitted;
  const basis = draft ? "по предварительной оценке" : route?.basedOn === "SPECIALIST" ? "по решению специалиста банка" : "по решению банка";

  // Что мешает: для черновика — причины предоценки (с кодами), после решения — причины решения
  const reasons: Array<{ code?: string; text: string }> = draft
    ? data.precheck?.reasons ?? []
    : (data.reasons ?? []).map((text) => ({ text }));

  const toggle = async (step: RouteStep, checked: boolean) => {
    const done = new Set((route?.steps ?? []).filter((s) => s.done).map((s) => s.code));
    if (checked) done.add(step.code); else done.delete(step.code);
    setSaving(step.code);
    try { await recalculateRoute([...done]); } finally { setSaving(null); }
  };

  if (!route) {
    return <Box className="route-page"><Box className="route-loading"><CircularProgress size={22} /> Строим маршрут…</Box></Box>;
  }

  const noRoute = route.status === "NO_ROUTE" || route.holds === "STOP_PERMANENT";
  const ready = route.status === "READY";

  return <Box className="route-page">
    {/* 1. Шапка */}
    <Button className="route-back" startIcon={<ArrowBack />} onClick={onBack}>Назад</Button>
    <Typography className="eyebrow">МАРШРУТ К ОДОБРЕНИЮ</Typography>
    <Typography component="h1" className="route-title">Маршрут к одобрению</Typography>
    <Typography color="text.secondary">
      {data.number ? `Заявка ${data.number} · ` : ""}Маршрут построен {basis}.
      {draft && " Кредитную историю проверим после подачи — результат может измениться."}
    </Typography>

    {/* 2. Карта-гора */}
    <Paper className="route-map-card">
      <Box className="r3-map">
        <img src="/images/mountain-route-hero.png" alt="" />
        <MountainRoute metrics={metrics} />
      </Box>
      <Box className="route-map-legend">
        <span><b>{formatMoney(metrics?.height ?? 0)}</b> доступно сейчас</span>
        <span className="route-hold">{HOLD_TEXT[route.holds ?? ""] ?? route.message}</span>
        <span><Flag /> <b>{formatMoney(data.amount)}</b> ваша вершина</span>
      </Box>
    </Paper>

    <Box className="route-grid">
      <Box className="route-main">
        {/* 3. Что мешает */}
        {reasons.length > 0 && <Paper className="route-block">
          <Typography className="route-block-title">Что мешает</Typography>
          {reasons.map((r, i) => {
            const tone = reasonTone(r.code);
            return <Box key={`${r.code ?? ""}${i}`} className={`route-item tone-${tone}${i === 0 ? " route-item-main" : ""}`}>
              <i /><span>{i === 0 ? <b>{r.text}</b> : r.text}</span>
              {r.code && <Chip size="small" label={toneLabel[tone]} />}
            </Box>;
          })}
        </Paper>}

        {/* 4–5. Следующий привал и шаги */}
        <Paper className="route-block">
          <Typography className="eyebrow">СЛЕДУЮЩИЙ ПРИВАЛ</Typography>
          <Typography variant="h5" fontWeight={800}>{route.horizonText}</Typography>
          {route.message && <Typography color="text.secondary">{route.message}</Typography>}
          {noRoute
            ? <Alert severity="info" className="route-advice">Маршрута к этому продукту сейчас нет. Можно подобрать другой вариант или обсудить ситуацию с помощником.</Alert>
            : <Box className="route-steps-list">
                {route.steps.map((step) => {
                  const tone = reasonTone(step.code, `${step.term} ${step.action}`);
                  const wait = WAIT_CODES.has(step.code);
                  return <Box key={step.code} className={`route-step tone-${tone}${step.done ? " route-step-done" : ""}`}>
                    <label>
                      {wait
                        ? <span className="route-wait" aria-hidden="true">⏳</span>
                        : <input type="checkbox" checked={step.done} disabled={saving !== null}
                            onChange={(e) => void toggle(step, e.target.checked)} />}
                      <span>
                        <b>{step.action}{step.targetTurnover ? ` — до ${formatMoney(step.targetTurnover)} в месяц` : ""}</b>
                        <small>
                          {wait ? "дождаться · " : ""}{step.term} · {toneLabel[tone]}
                          {step.pointsGain ? ` · +${step.pointsGain} к оценке` : step.code.startsWith("S_") && !wait ? " · без него маршрут не двигается" : ""}
                        </small>
                        {step.bkiDelayBusinessDays ? <small className="route-bki">Бюро обновит данные за {step.bkiDelayBusinessDays} рабочих дня</small> : null}
                      </span>
                      {saving === step.code && <CircularProgress size={14} />}
                    </label>
                  </Box>;
                })}
              </Box>}
        </Paper>
      </Box>

      <Box className="route-side">
        {/* 6. Прогноз */}
        {!noRoute && <Paper className="route-block">
          <Typography className="eyebrow">ПРОГНОЗ ПОСЛЕ ВСЕХ ШАГОВ</Typography>
          <Typography className="route-forecast">{route.projectedAmount != null ? formatMoney(route.projectedAmount) : "—"}</Typography>
          <Typography color="text.secondary">
            {route.projectedAmount != null && route.projectedAmount >= data.amount
              ? "Вершина становится доступной"
              : route.projectedAmount != null ? `Из ${formatMoney(data.amount)} запрошенных` : "Срок зависит от темпа роста оборота"}
          </Typography>
        </Paper>}

        {/* 7. Чего не делать */}
        {(route.advice ?? []).length > 0 && <Paper className="route-block">
          <Typography className="route-block-title">Чего не делать</Typography>
          {(route.advice ?? []).map((tip) => <Alert key={tip} severity="warning" className="route-advice">{tip}</Alert>)}
        </Paper>}

        {/* 9. Действия */}
        <Paper className="route-block route-actions">
          {ready
            ? <><Typography fontWeight={800}>Готов к подаче</Typography>
                <Typography color="text.secondary">Прогноз дошёл до порога. Новую заявку подаёте вы сами — банк проверит данные заново.</Typography>
                <Button variant="contained" endIcon={<ArrowForward />} onClick={() => void onNewApplication()}>Подать новую заявку</Button></>
            : <Typography color="text.secondary">Отмечайте выполненные шаги — маршрут пересчитается. Пересчёт не создаёт заявку и не обращается в бюро кредитных историй.</Typography>}
          <Button variant="outlined" startIcon={<ChatBubbleOutline />} onClick={onHelp}>Спросить помощника</Button>
        </Paper>
      </Box>
    </Box>

    {/* 8. Подпись — дословно */}
    <Typography className="precheck-disclaimer route-disclaimer">{route.disclaimer}</Typography>
  </Box>;
}
