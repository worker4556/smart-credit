import {
  Box,
  Typography,
  Button,
  Paper,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Slider,
  TextField,
  Radio,
  Checkbox,
  FormControlLabel,
  Divider,
  Tooltip,
  IconButton,
  Alert,
} from "@mui/material";
import AccountBalanceWallet from "@mui/icons-material/AccountBalanceWallet";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ArrowForward from "@mui/icons-material/ArrowForward";
import CheckCircle from "@mui/icons-material/CheckCircle";
import CloudUpload from "@mui/icons-material/CloudUpload";
import HelpOutline from "@mui/icons-material/HelpOutline";
import LightbulbOutlined from "@mui/icons-material/LightbulbOutlined";
import ReceiptLong from "@mui/icons-material/ReceiptLong";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import Storefront from "@mui/icons-material/Storefront";
import Timeline from "@mui/icons-material/Timeline";
import VerifiedUser from "@mui/icons-material/VerifiedUser";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import Autorenew from "@mui/icons-material/Autorenew";
import CloudOutlined from "@mui/icons-material/CloudOutlined";
import ThunderstormOutlined from "@mui/icons-material/ThunderstormOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import type { ReactNode } from "react";
import {
  FooterNav,
  IconBubble,
  SelectCard,
  StepTitle,
} from "../components/ApplicationShell";
import { formatMoney as money, formatNumber as format } from "../utils/format";
import { goals } from "../data/application";
import type { LoanOffer, OffersPageProps, Weather } from "../types";
import { chanceLabel, chanceTone, needsRoute, reasonTone, toneLabel } from "../utils/route";

const kindLabel: Record<string, string> = {
  REQUESTED: "Запрошенная сумма",
  WITHIN_ESTIMATE: "В пределах оценки",
  OTHER_TERM: "Другой срок",
  OTHER_PRODUCT: "Другой продукт",
};

function minIndex(offers: LoanOffer[], key: "monthly" | "fullCost"): number {
  let best = -1;
  offers.forEach((offer, index) => {
    const value = offer[key];
    if (value == null) return;
    if (best < 0 || value < (offers[best][key] ?? Infinity)) best = index;
  });
  return best;
}

function displayMoney(value: string | number | undefined): string {
  if (typeof value === "number") return money(value);
  if (value && /^\s*[\d\s.,]+\s*(₽|руб\.?|р\.)?\s*$/i.test(value)) {
    const amount = Number(value.replace(/[^\d]/g, ""));
    if (Number.isFinite(amount)) return money(amount);
  }
  return value ?? "—";
}

export default function OffersPage({
  data,
  update,
  next,
  goalOffers,
  selectedOffer,
  setSelectedOffer,
  monthly,
  chosen,
  setToast: _setToast,
  onChoose,
  onOpenRoute,
}: OffersPageProps) {
  // Стоп-фактор в предоценке: подавать заявку бессмысленно — основное действие «Открыть маршрут без подачи»
  const hasStop = (data.precheck?.reasons ?? []).some((reason) => reason.code?.startsWith("S_"));
  const showRoute = Boolean(onOpenRoute) && needsRoute(data.precheck, data.amount);
  return (
    <>
      <StepTitle
        eyebrow="ШАГ 4 ИЗ 6 · ПОДБОР ДЛЯ ВАС"
        title="Вот что нам подходит"
        subtitle="Сравните варианты. Все условия пока предварительные."
      />
      {data.precheck && (
        <Paper className="precheck-card">
          <Box className="precheck-amounts">
            <Box>
              <Typography className="eyebrow">ТЕКУЩАЯ ВЫСОТА</Typography>
              <Typography className="precheck-value">
                {data.precheck.amountHigh > 0
                  ? `${money(data.precheck.amountLow)} — ${money(data.precheck.amountHigh)}`
                  : "Пока недоступно"}
              </Typography>
            </Box>
            <Box>
              <Typography className="eyebrow">ВАША ВЕРШИНА</Typography>
              <Typography className="precheck-value">
                {money(data.amount)}
              </Typography>
            </Box>
            <Box>
              <Typography className="eyebrow">ПРЕДВАРИТЕЛЬНЫЙ ШАНС</Typography>
              <Chip
                label={chanceLabel[data.precheck.chance?.toUpperCase()] ?? data.precheck.chance}
                className={`tone-chip tone-${chanceTone[data.precheck.chance?.toUpperCase()] ?? "amber"}`}
              />
            </Box>
          </Box>
          {needsRoute(data.precheck, data.amount) && (
            <Box className="uncertainty-route">
              <Typography fontWeight={800}>Что влияет на решение и как это исправить</Typography>
              {data.precheck.amountHigh > 0 && data.amount > data.precheck.amountHigh && (
                <Box className="route-item tone-green">
                  <i />
                  <span>
                    Сумма выше оценки. Ниже есть вариант в пределах{" "}
                    {money(data.precheck.amountHigh)} — по нему шансы выше.
                  </span>
                  <Chip size="small" label="Альтернатива" />
                </Box>
              )}
              {(data.precheck.reasons ?? []).map((reason, index) => {
                const tone = reasonTone(reason.code);
                return (
                  <Box key={reason.code ?? index} className={`route-item tone-${tone}`}>
                    <i />
                    <span>{reason.text}</span>
                    <Chip size="small" label={toneLabel[tone]} />
                  </Box>
                );
              })}
              {showRoute && (
                <Button variant={hasStop ? "contained" : "outlined"} className="open-route-btn" endIcon={<ArrowForward />} onClick={onOpenRoute}>
                  Открыть маршрут без подачи
                </Button>
              )}
              {showRoute && (
                <Typography variant="body2" color="text.secondary">
                  Заявка не создаётся и бюро кредитных историй не запрашивается — маршрут считается по предварительной оценке.
                </Typography>
              )}
            </Box>
          )}
          <Typography className="precheck-explanation">{data.precheck.text}</Typography>
          {data.precheck.ownerNote && (
            <Alert severity="info" className="owner-note">
              {data.precheck.ownerNote}
            </Alert>
          )}
          {!data.precheck.text?.includes(data.precheck.disclaimer ?? "Это оценка") && (
            <Typography className="precheck-disclaimer">
              {data.precheck.disclaimer ?? "Это оценка по текущим данным, а не решение банка. Действует 30 дней"}
            </Typography>
          )}
        </Paper>
      )}
      {goalOffers.length === 0 && (
        <Paper className="empty-offers">
          <Typography variant="h6" fontWeight={800}>
            Пока нет подходящих предложений
          </Typography>
          <Typography color="text.secondary">
            Можно отправить заявку на проверку или вернуться и изменить сумму и
            срок.
          </Typography>
        </Paper>
      )}
      <Box className="offers-layout">
        <Box className="offers-list">
          {goalOffers.map((o, i) => {
            const lowestPayment = goalOffers.length > 1 && i === minIndex(goalOffers, "monthly") && i !== 0;
            const lowestCost = goalOffers.length > 1 && i === minIndex(goalOffers, "fullCost") && i !== 0;
            const amountText = displayMoney(o.amount);
            const detail = o.detail ?? [
              o.termMonths ? `${o.termMonths} мес.` : null,
              o.rate != null ? `ставка ${o.rate}%` : null,
                o.monthly ? `платёж ${money(o.monthly)}/мес.` : null,
                o.fullCost ? `переплата ${money(o.fullCost)}` : null,
            ].filter(Boolean).join(" · ");
            return (
            <Card
              key={`${o.name}-${o.amount}-${o.termMonths ?? i}`}
              onClick={() => {
                setSelectedOffer(i);
                update("offer", i);
              }}
              className={`offer-card ${selectedOffer === i ? "offer-selected" : ""} ${i === 0 && o.kind ? "offer-best" : ""}`}
            >
              <CardContent>
                <Box className="offer-topline">
                  <Box className="offer-badges">
                    {i === 0 && o.kind && (
                      <Chip label="★  ЛУЧШИЙ ВАРИАНТ" size="small" className="best-chip" />
                    )}
                    {!o.kind && <Chip label="Шансы низкие · можно отправить на проверку" size="small" className="tone-chip tone-red" />}
                    {lowestPayment && <Chip label="Ниже платёж" size="small" className="tone-chip tone-green" />}
                    {lowestCost && <Chip label="Меньше переплата" size="small" className="tone-chip tone-green" />}
                    {o.kind && kindLabel[o.kind] && <Chip label={kindLabel[o.kind]} size="small" variant="outlined" />}
                  </Box>
                  <Radio checked={selectedOffer === i} />
                </Box>
                <Typography variant="h5" fontWeight={800}>
                  {o.name}
                </Typography>
                <Typography className="offer-amount">{amountText}</Typography>
                <Typography color="text.secondary">{detail}</Typography>
                <Box className="offer-explain">
                  <CheckCircle fontSize="small" />
                  <span>
                    {o.why && <><b>Почему подходит:</b> {o.why}</>}
                  </span>
                </Box>
              </CardContent>
            </Card>
            );
          })}
          <WeatherCard weather={chosen?.weather ?? data.precheck?.weather} />
        </Box>
        <Paper className="recommend-card">
          <Typography className="eyebrow">ВАШ ВЫБОР</Typography>
          {chosen ? (
            <>
              <Typography variant="h5" fontWeight={800}>
                {chosen.name}
              </Typography>
              <Typography variant="h4" className="rec-payment">
                {money(chosen.monthly ?? monthly)}
              </Typography>
              <Typography className="recommend-detail" color="text.secondary">
                в месяц · {displayMoney(chosen.amount)}
                {chosen.termMonths ? ` на ${chosen.termMonths} мес.` : ""} · предварительно
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="h5" fontWeight={800}>
                Нет подходящего предложения
              </Typography>
              <Typography color="text.secondary">
                Заявку всё равно можно отправить на проверку.
              </Typography>
            </>
          )}
          <Divider />
          <Typography fontWeight={700}>Что понадобится</Typography>
          <Stack spacing={1} className="needed-list">
            <Box>
              <CheckCircle />
              Паспорт руководителя
            </Box>
            <Box>
              <CheckCircle />
              Налоговая отчетность
            </Box>
          </Stack>
          {showRoute && hasStop && (
            <Button variant="contained" fullWidth endIcon={<ArrowForward />} onClick={onOpenRoute}>
              Открыть маршрут без подачи
            </Button>
          )}
          <Button
            variant={showRoute && hasStop ? "outlined" : "contained"}
            fullWidth
          onClick={() => void onChoose()}
            endIcon={<ArrowForward />}
          >
            {chosen ? "Выбрать этот вариант" : "Продолжить без предложения"}
          </Button>
          <Button variant="text" color="inherit" onClick={() => next(0)}>
            Изменить цель, сумму или срок
          </Button>
          <Typography className="mini-disclaimer">
            Окончательные условия назовем после проверки заявки.
          </Typography>
        </Paper>
      </Box>
      <Box className="catalog-teaser">
        <Typography variant="h6" fontWeight={800}>
          В каталоге также есть
        </Typography>
        <Typography color="text.secondary">
          Кредит на оборудование · Рефинансирование · Льготные программы
          поддержки бизнеса
        </Typography>
        <Typography variant="body2" color="text.secondary">Дополнительные продукты доступны в каталоге банка.</Typography>
      </Box>
      <FooterNav
        onBack={() => next(2)}
        onNext={() => void onChoose()}
        next={
          goalOffers.length
            ? "Продолжить с выбранным вариантом"
            : "Продолжить без предложения"
        }
      />
    </>
  );
}

// «Погода» по выбранному варианту: сколько кредит стоит сейчас и что будет, если что-то пойдёт не так
const weatherIcon: Record<string, ReactNode> = { BASE: <WbSunnyOutlined />, RATE_UP: <CloudOutlined />, OVERDUE_30: <ThunderstormOutlined /> };
function WeatherCard({ weather }: { weather?: Weather | null }) {
  if (!weather?.rows?.length) return null;
  const base = weather.rows.find((row) => row.code === "BASE");
  return (
    <Paper className="weather-card">
      <Box className="weather-head">
        <Typography className="eyebrow">ПОГОДА ПО КРЕДИТУ</Typography>
        <Tooltip title={weather.disclaimer}><HelpOutline fontSize="small" aria-label={weather.disclaimer} /></Tooltip>
      </Box>
      <Box className="weather-rows">
        {weather.rows.map((row) => {
          const ratio = base && base.fullCost > 0 ? Math.min(row.fullCost / (base.fullCost * 1.6), 1) : 1;
          return (
            <Box key={row.code} className={`weather-row weather-${row.code.toLowerCase()}`}>
              <span className="weather-icon" aria-hidden="true">{weatherIcon[row.code]}</span>
              <Box className="weather-body">
                <Typography className="weather-title">{row.code === "BASE" ? "Сейчас" : row.title}</Typography>
                <Box className="weather-bar"><i style={{ transform: `scaleX(${ratio})` }} /></Box>
                {row.note && <Typography className="weather-note">{row.note}</Typography>}
              </Box>
              <Box className="weather-sum">
                <b>{money(row.fullCost)}</b>
                <span>{row.deltaFullCost > 0 ? `+${money(row.deltaFullCost)}` : `${money(row.monthlyPayment)}/мес.`}</span>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Typography className="weather-disclaimer">Полная стоимость в рублях: проценты и комиссии сверх суммы кредита. {weather.disclaimer}</Typography>
    </Paper>
  );
}
