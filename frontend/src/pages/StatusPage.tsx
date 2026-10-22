import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import CheckCircle from "@mui/icons-material/CheckCircle";
import CloudUpload from "@mui/icons-material/CloudUpload";
import RouteMap from "../components/RouteMap";
import { reasonTone, toneLabel } from "../utils/route";

// Что держит решение — по ответу движка (route.holds)
const holdLabel: Record<string, string> = {
  STOP: "Стоп-фактор",
  STOP_PERMANENT: "Постоянный стоп-фактор",
  TIME_WINDOW: "Ограничение по времени",
  TURNOVER: "Сумму держит оборот",
  SCORE: "Не хватает баллов",
};
import { formatMoney as money } from "../utils/format";
import type { StatusPageProps } from "../types";

const statusCopy = {
  review: ["Проверяем заявку", "Сверяем данные компании и оцениваем заявку."],
  specialist: ["Заявка у специалиста", "Статус и дальнейшие действия указаны банком."],
  approved: [
    "Заявка одобрена",
    "Проверьте сумму и стоимость, затем решите, принимать ли условия.",
  ],
  partial: [
    "Иные условия",
    "По заявке доступна сумма, отличающаяся от запрошенной.",
  ],
  info: [
    "Нужны данные",
    "Загрузите выписку по счёту, чтобы продолжить проверку.",
  ],
  rejected: [
    "Сейчас не можем одобрить",
    "Посмотрите объяснение и возможные шаги для повторной оценки.",
  ],
  suspended: ["Проверка приостановлена", ""],
} as const;

export default function StatusPage({
  data,
  next,
  uploadDocument,
  acceptOffer,
  signOffer,
  onNewApplication,
  recalculateRoute,
}: StatusPageProps) {
  const [baseTitle, summary] = statusCopy[data.outcome];
  const title = data.status === "DISBURSED" ? "Деньги перечислены" : data.status === "SIGNED" ? "Договор подписан" : baseTitle;
  const waiting = ["review", "specialist"].includes(data.outcome) || data.status === "SIGNED";
  const availableAmount = data.decisionAmount ?? 0;
  const hasRoute = ["rejected", "partial"].includes(data.outcome);

  return (
    <>
      <Box className="status-hero">
        <Box>
          <Chip label={`ЗАЯВКА ${data.number ?? ""}`} className="status-number" />
          <Typography variant="h2" className="status-title">
            {title}
          </Typography>
          <Typography className="status-lead">
            {data.decisionText ?? (data.outcome === "suspended" ? "" : summary)}
          </Typography>
        </Box>
        <Box className="status-snapshot">
          <Typography className="eyebrow">ДАННЫЕ РЕШЕНИЯ</Typography>
          {data.decisionAmount != null && (
            <Typography variant="h4">{money(data.decisionAmount)}</Typography>
          )}
          {data.decisionRate != null && <Typography>Ставка: {data.decisionRate}%</Typography>}
          {data.decisionMonthly != null && <Typography>Платёж в месяц: {money(data.decisionMonthly)}</Typography>}
          {data.reasons?.map((reason, index) => <Typography key={index}>{reason}</Typography>)}
          {data.outcome === "review" && (
            <Typography color="text.secondary">
              Проверяем этапы Б1—Б4
            </Typography>
          )}
        </Box>
      </Box>

      <Paper className="timeline-panel status-timeline">
        <Typography variant="h5" fontWeight={800}>
          История заявки
        </Typography>
        <Box className="timeline">
          {(data.activity.length
            ? data.activity
            : [{ at: "", text: "Заявка отправлена" }]
          ).map((event, index) => (
            <Box
              className={`timeline-step complete ${index === data.activity.length - 1 && data.outcome === "review" ? "active" : ""}`}
              key={`${event.at}-${event.text}`}
            >
              <Box className="timeline-mark">
                <CheckCircle />
              </Box>
              <Typography fontWeight={700}>{event.text}</Typography>
              <Typography variant="caption">
                {event.at
                  ? /^\d{1,2}:\d{2}$/.test(event.at)
                    ? event.at
                    : new Date(event.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
                  : "Сейчас"}
              </Typography>
            </Box>
          ))}
        </Box>
        {waiting && (
          <Typography color="text.secondary">
            Обновляем статус автоматически.
          </Typography>
        )}
      </Paper>

      {data.outcome === "info" && (
        <Paper className="route-decision info-request">
          <Box>
            <Typography className="eyebrow">ЧТО НУЖНО ЗАГРУЗИТЬ</Typography>
            <Typography fontWeight={800}>Выписка по счёту</Typography>
            <Typography color="text.secondary">
              Загрузите выписку по счёту, чтобы продолжить проверку заявки.
            </Typography>
          </Box>
          <Button
            component="label"
            variant="contained"
            startIcon={<CloudUpload />}
          >
            Загрузить выписку
            <input
              hidden
              type="file"
              accept=".pdf,.csv,.xlsx,.xls"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadDocument(file);
              }}
            />
          </Button>
        </Paper>
      )}

      {(data.outcome === "approved" || data.outcome === "partial") && (
        <Paper className="route-decision">
          <Box>
            <Typography className="eyebrow">УСЛОВИЯ ФИНАНСИРОВАНИЯ</Typography>
            <Typography fontWeight={800}>{data.decisionText}</Typography>
            {data.decisionAmount != null && <Typography>Сумма: {money(data.decisionAmount)}</Typography>}
            {data.decisionRate != null && <Typography>Ставка: {data.decisionRate}%</Typography>}
            {data.decisionMonthly != null && <Typography>Платёж в месяц: {money(data.decisionMonthly)}</Typography>}
          </Box>
          {(data.status === "APPROVED" || data.status === "COUNTER_OFFER") && (
            <Button variant="contained" onClick={() => void acceptOffer()}>Принять условия</Button>
          )}
          {data.status === "OFFER_ACCEPTED" && (
            <Button variant="contained" onClick={() => void signOffer()}>Подписать договор</Button>
          )}
          {data.status === "SIGNED" && <Chip label="Договор подписан · перечисляем деньги…" className="tone-chip tone-amber" />}
          {data.status === "DISBURSED" && <Chip label="✓ Деньги перечислены на счёт" className="tone-chip tone-green" />}
        </Paper>
      )}

      {hasRoute && (
        <Paper className="decision-route-panel">
          <RouteMap
            compact
            restricted
            currentLabel="Доступная высота"
            summitLabel="Запрошенная вершина"
            currentAmount={availableAmount}
            targetAmount={data.amount}
            obstacleLabel={holdLabel[data.route?.holds ?? ""] ?? "Ограничение по лимиту"}
          />
          <Box className="route-steps">
            <Typography className="eyebrow">СЛЕДУЮЩИЙ ПРИВАЛ</Typography>
            <Typography variant="h5" fontWeight={800}>
            {data.route?.horizonText ?? "Загружаем маршрут рекомендаций…"}
            </Typography>
            {data.route?.message && (
              <Typography color="text.secondary">{data.route.message}</Typography>
            )}
            {data.route?.basedOn === "SPECIALIST" && (
              <Typography variant="body2" color="text.secondary">
                Маршрут построен по решению специалиста банка.
              </Typography>
            )}
            {(data.route?.steps ?? []).map((step) => (
              <Box className={`route-step tone-${reasonTone(step.code, `${step.term} ${step.action}`)}`} key={step.code}>
                <label>
                  <input
                    type="checkbox"
                    checked={step.done}
                    onChange={(event) => {
                      const done = new Set(
                        (data.route?.steps ?? [])
                          .filter((item) => item.done)
                          .map((item) => item.code),
                      );
                      event.target.checked
                        ? done.add(step.code)
                        : done.delete(step.code);
                      void recalculateRoute([...done]);
                    }}
                  />
                  <span>
                    <b>{step.action}</b>
                    <small>
                      {step.term} · {toneLabel[reasonTone(step.code, `${step.term} ${step.action}`)]}
                    </small>
                  </span>
                </label>
              </Box>
            ))}
            {(data.route?.advice ?? []).map((tip) => (
              <Alert key={tip} severity="warning" className="route-advice">{tip}</Alert>
            ))}
            <Typography className="precheck-disclaimer">
              {data.route?.disclaimer}
            </Typography>
          </Box>
        </Paper>
      )}

      <Divider sx={{ my: 2 }} />
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        className="status-note"
      >
        <CheckCircle color="success" fontSize="small" />
        <Typography variant="body2">
          Статус и история получены с backend API.{" "}
          {data.outcome === "review" ? "Обновление — каждые 3 секунды." : ""}
        </Typography>
      </Stack>
      <Box className="status-actions">
        <Button onClick={() => void onNewApplication()}>Новая заявка</Button>
      </Box>
    </>
  );
}
