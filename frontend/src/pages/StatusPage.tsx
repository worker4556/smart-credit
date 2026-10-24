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
import HourglassEmpty from "@mui/icons-material/HourglassEmpty";
import PauseCircleOutline from "@mui/icons-material/PauseCircleOutline";
import SentimentDissatisfiedOutlined from "@mui/icons-material/SentimentDissatisfiedOutlined";
import SwapHoriz from "@mui/icons-material/SwapHoriz";
import UploadFileOutlined from "@mui/icons-material/UploadFileOutlined";
import type { ReactNode } from "react";
import CloudUpload from "@mui/icons-material/CloudUpload";
import ArrowForward from "@mui/icons-material/ArrowForward";
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

// Итоговые статусы, которые не являются решением банка
const statusOverride: Record<string, readonly [string, string]> = {
  WITHDRAWN: ["Заявка отозвана", "Вы отозвали заявку. Данные сохранены — можно подать новую."],
  EXPIRED: ["Срок заявки истёк", "Ответа не было в отведённый срок. Подайте новую заявку — предоценка пересчитается."],
  DECLINED_BY_CLIENT: ["Вы отклонили предложение", "Ниже — что нужно, чтобы в следующий раз банк дал всю сумму."],
};

// 115-ФЗ: некредитная процедура. Маршрута к одобрению нет, есть порядок действий по правилам Банка России
const zskSteps = [
  "Проверьте свой уровень риска на открытом сервисе Банка России «Знай своего клиента» по ИНН.",
  "Подготовьте пояснения и документы по операциям: договоры, акты, счета. Банк запросит их, чтобы снять приостановку.",
  "Если не согласны с высоким уровнем риска — подайте в Банк России заявление о пересмотре. Если банк ограничил операции — решение можно обжаловать в Межведомственной комиссии при Банке России.",
  "После пересмотра подайте новую заявку: кредитную оценку эта проверка не ухудшает.",
];

export default function StatusPage({
  data,
  next,
  uploadDocument,
  acceptOffer,
  signOffer,
  declineOffer,
  withdrawApplication,
  onNewApplication,
  recalculateRoute,
  onOpenRoute,
}: StatusPageProps) {
  const byStatus = data.status ? statusOverride[data.status] : undefined;
  const [baseTitle, summary] = byStatus ?? statusCopy[data.outcome];
  const title = data.status === "DISBURSED" ? "Деньги перечислены" : data.status === "SIGNED" ? "Договор подписан" : baseTitle;
  const waiting = ["review", "specialist"].includes(data.outcome) || data.status === "SIGNED";
  const availableAmount = data.decisionAmount ?? 0;
  // Маршрут — только там, где банк ограничил сумму или отказал; не для отзыва, истечения и 115-ФЗ
  const hasRoute = ["REJECTED", "COUNTER_OFFER", "DECLINED_BY_CLIENT"].includes(data.status ?? "")
    || (!data.status && ["rejected", "partial"].includes(data.outcome));
  // В одобрении причины снижения оценки только путают
  // Отозванная или истёкшая заявка не получила решения банка — сумм и причин не показываем
  const noDecision = ["WITHDRAWN", "EXPIRED"].includes(data.status ?? "");
  const showReasons = !noDecision && !["approved"].includes(data.outcome);
  const isOverdraft = data.goal === "Перекрыть кассовый разрыв";
  // Итог одним взглядом: цвет и значок рядом с заголовком
  const badge = statusBadge(data.status, data.outcome);
  const amountLabel = isOverdraft ? "Лимит овердрафта" : "Сумма";
  const monthlyLabel = isOverdraft ? "Проценты в месяц при полном использовании" : "Платёж в месяц";

  return (
    <>
      <Box className="status-hero">
        <Box>
          <Box className="status-top">
            <Chip label={`ЗАЯВКА ${data.number ?? ""}`} className="status-number" />
            <Box className={`status-badge tone-${badge.tone}`}>{badge.icon}<span>{badge.label}</span></Box>
          </Box>
          <Typography variant="h2" className="status-title">
            {title}
          </Typography>
          <Typography className="status-lead">
            {byStatus ? summary : data.decisionText ?? (data.outcome === "suspended" ? "" : summary)}
          </Typography>
        </Box>
        <Box className="status-snapshot">
          <Typography className="eyebrow">ДАННЫЕ РЕШЕНИЯ</Typography>
          {!noDecision && data.decisionAmount != null && (
            <Typography variant="h4">{money(data.decisionAmount)}</Typography>
          )}
          {!noDecision && data.decisionRate != null && <Typography>Ставка: {data.decisionRate}%</Typography>}
          {!noDecision && data.decisionMonthly != null && <Typography>{monthlyLabel}: {money(data.decisionMonthly)}</Typography>}
          {noDecision && <Typography color="text.secondary">Решение по заявке не принималось</Typography>}
          {showReasons && data.reasons?.map((reason, index) => <Typography key={index}>{reason}</Typography>)}
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
            <Typography fontWeight={800}>{data.infoRequest?.text ?? "Выписка по счёту"}</Typography>
            <Typography color="text.secondary">
              {data.infoRequest?.dueDate
                ? `Срок — до ${new Date(data.infoRequest.dueDate).toLocaleDateString("ru-RU")}. Загрузите в эту же заявку: новая заявка и повторный запрос в БКИ не нужны.`
                : "Загрузите выписку по счёту, чтобы продолжить проверку заявки."}
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
            {data.decisionAmount != null && <Typography>{amountLabel}: {money(data.decisionAmount)}</Typography>}
            {data.decisionRate != null && <Typography>Ставка: {data.decisionRate}%</Typography>}
            {data.decisionMonthly != null && <Typography>{monthlyLabel}: {money(data.decisionMonthly)}</Typography>}
          </Box>
          {(data.status === "APPROVED" || data.status === "COUNTER_OFFER") && (
            <Button variant="contained" onClick={() => void acceptOffer()}>Принять условия</Button>
          )}
          {data.status === "COUNTER_OFFER" && (
            <Button variant="outlined" color="inherit" onClick={() => void declineOffer()}>Отклонить и посмотреть маршрут</Button>
          )}
          {data.status === "OFFER_ACCEPTED" && (
            <Button variant="contained" onClick={() => void signOffer()}>Подписать договор</Button>
          )}
          {data.status === "SIGNED" && <Chip label="Договор подписан · перечисляем деньги…" className="tone-chip tone-amber" />}
          {data.status === "DISBURSED" && <Chip label="✓ Деньги перечислены на счёт" className="tone-chip tone-green" />}
        </Paper>
      )}

      {data.outcome === "suspended" && (
        <Paper className="route-decision zsk-steps">
          <Box>
            <Typography className="eyebrow">ЧТО ДЕЛАТЬ ДАЛЬШЕ · ПРОЦЕДУРА 115-ФЗ</Typography>
            <Typography fontWeight={800}>
              Это не кредитный отказ, поэтому маршрута к одобрению нет: шаги ниже снимают проверку, а не повышают оценку.
            </Typography>
            <ol>
              {zskSteps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button variant="contained" href="https://www.cbr.ru/counteraction_m_ter/platform_zsk/proverka-po-inn/" target="_blank" rel="noopener noreferrer">
                Проверить уровень риска по ИНН
              </Button>
              <Button variant="outlined" color="inherit" href="https://www.cbr.ru/counteraction_m_ter/platform_zsk/" target="_blank" rel="noopener noreferrer">
                Порядок пересмотра — Банк России
              </Button>
            </Stack>
          </Box>
        </Paper>
      )}

      {data.status === "SPECIALIST_REVIEW" && (
        <Box className="status-actions">
          <Button variant="outlined" color="inherit" onClick={() => void withdrawApplication()}>Отозвать заявку</Button>
        </Box>
      )}

      {/* Маршрут — на главной («Гора»); здесь только следующий привал и переход к нему */}
      {hasRoute && (
        <Paper className="next-stop">
          <Box className="next-stop-body">
            <Typography className="next-stop-label">Следующий привал</Typography>
            <Typography className="next-stop-title">{data.route?.horizonText ?? "Строим маршрут…"}</Typography>
            {data.route?.message && <Typography className="next-stop-text">{data.route.message}</Typography>}
          </Box>
          {onOpenRoute && data.route?.status !== "NO_ROUTE" && data.route?.holds !== "STOP_PERMANENT" && (
            <Button variant="contained" endIcon={<ArrowForward />} onClick={onOpenRoute}>Маршрут на главной</Button>
          )}
        </Paper>
      )}

      <Box className="status-actions">
        <Button variant="outlined" color="inherit" onClick={() => void onNewApplication()}>Новая заявка</Button>
      </Box>
    </>
  );
}

type BadgeTone = "green" | "amber" | "red" | "neutral";
function statusBadge(status: string | undefined, outcome: string): { tone: BadgeTone; label: string; icon: ReactNode } {
  if (["APPROVED", "OFFER_ACCEPTED", "SIGNED", "DISBURSED"].includes(status ?? "") || outcome === "approved")
    return { tone: "green", label: status === "DISBURSED" ? "Деньги на счёте" : "Одобрено", icon: <CheckCircle /> };
  if (status === "COUNTER_OFFER" || outcome === "partial") return { tone: "amber", label: "Иные условия", icon: <SwapHoriz /> };
  if (status === "INFO_REQUESTED" || outcome === "info") return { tone: "amber", label: "Нужны документы", icon: <UploadFileOutlined /> };
  if (status === "SUSPENDED_115FZ" || outcome === "suspended") return { tone: "red", label: "Проверка по 115-ФЗ", icon: <PauseCircleOutline /> };
  if (["REJECTED", "DECLINED_BY_CLIENT"].includes(status ?? "") || outcome === "rejected")
    return { tone: "red", label: status === "DECLINED_BY_CLIENT" ? "Вы отказались" : "Пока отказано", icon: <SentimentDissatisfiedOutlined /> };
  if (["WITHDRAWN", "EXPIRED"].includes(status ?? "")) return { tone: "neutral", label: status === "WITHDRAWN" ? "Отозвана" : "Истекла", icon: <HourglassEmpty /> };
  return { tone: "neutral", label: outcome === "specialist" ? "У специалиста" : "На проверке", icon: <HourglassEmpty /> };
}
