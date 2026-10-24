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
import Block from "@mui/icons-material/Block";
import Bolt from "@mui/icons-material/Bolt";
import Schedule from "@mui/icons-material/Schedule";
import SwapVert from "@mui/icons-material/SwapVert";
import type { ReactNode } from "react";
import {
  FooterNav,
  IconBubble,
  SelectCard,
  StepTitle,
} from "../components/ApplicationShell";
import { formatMoney as money, formatNumber as format } from "../utils/format";
import { goals } from "../data/application";
import type { LoanOffer, OffersPageProps, Precheck, Weather } from "../types";
import { chanceLabel, chanceTone, needsRoute, reasonTone, toneLabel } from "../utils/route";

// Кредитный продукт — явно, над «человеческим» названием варианта
const productLabel: Record<string, string> = { WORKING_CAPITAL: "Оборотный кредит", OVERDRAFT: "Овердрафт" };

const kindLabel: Record<string, string> = {
  REQUESTED: "Запрошенная сумма",
  WITHIN_ESTIMATE: "В пределах оценки",
  AS_REQUESTED: "Как просили",
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
          <AltitudeGauge precheck={data.precheck} amount={data.amount} />
          {needsRoute(data.precheck, data.amount) && (
            <FactorList
              precheck={data.precheck}
              amount={data.amount}
              route={showRoute ? { onOpen: onOpenRoute, primary: hasStop } : undefined}
            />
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
                {o.product && <Typography className="offer-product">{productLabel[o.product] ?? o.product}</Typography>}
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
              {chosen.product && <Typography className="offer-product">{productLabel[chosen.product] ?? chosen.product}</Typography>}
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
          Скоро в кабинете
        </Typography>
        <Typography color="text.secondary">
          Кредитная линия · Кредит на развитие · Лизинг
        </Typography>
        <Typography variant="body2" color="text.secondary">Подать заявку на них пока нельзя — сейчас подойдут продукты выше.</Typography>
      </Box>
      <FooterNav onBack={() => next(2)} />
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

// «Высота»: доступный сейчас диапазон и вершина (запрошенная сумма) на одной шкале
const short = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} млн` : `${Math.round(value / 1000)} тыс.`;
const chanceSteps = ["LOW", "MEDIUM", "HIGH"];

function AltitudeGauge({ precheck, amount }: { precheck: Precheck; amount: number }) {
  const { amountLow: low, amountHigh: high } = precheck;
  const chance = precheck.chance?.toUpperCase();
  // Шкала начинается чуть ниже доступного диапазона: важен разрыв до вершины, а не путь от нуля
  const top = Math.max(amount, high, 1) * 1.08;
  const floor = high > 0 ? Math.min(low, amount) * 0.7 : 0;
  const at = (value: number) => `${Math.min(Math.max((value - floor) / (top - floor), 0), 1) * 100}%`;
  const gap = high > 0 ? amount - high : amount;
  return (
    <Box className="altitude">
      <Box className="altitude-top">
        <Box>
          <Typography className="altitude-label">Доступно сейчас</Typography>
          <Typography className="altitude-value">{high > 0 ? `${money(low)} — ${money(high)}` : "Пока недоступно"}</Typography>
        </Box>
        <Box className="altitude-chance" aria-label={`Предварительный шанс: ${chanceLabel[chance] ?? precheck.chance}`}>
          <Typography className="altitude-label">Шанс</Typography>
          <Box className={`chance-meter tone-${chanceTone[chance] ?? "amber"}`}>
            {chanceSteps.map((step, i) => <i key={step} className={i <= chanceSteps.indexOf(chance) ? "on" : ""} />)}
            <b>{chanceLabel[chance] ?? precheck.chance}</b>
          </Box>
        </Box>
      </Box>
      <Box className="altitude-track" aria-hidden="true">
        <span className="altitude-rail" />
        {high > 0 && <span className="altitude-band" style={{ left: at(low), width: `calc(${at(high)} - ${at(low)})` }} />}
        {high > 0 && gap > 0 && <span className="altitude-gap" style={{ left: at(high), width: `calc(${at(amount)} - ${at(high)})` }} />}
        <span className="altitude-summit" style={{ left: at(amount) }}><em>{short(amount)}</em></span>
        {high > 0 && <span className="altitude-high" style={{ left: at(low) }}><em>{short(low)}</em></span>}
        {high > 0 && <span className="altitude-high" style={{ left: at(high) }}><em>{short(high)}</em></span>}
      </Box>
      <Typography className={`altitude-note ${gap > 0 ? "short" : "ok"}`}>
        {gap > 0
          ? high > 0 ? `До вашей вершины ${money(amount)} не хватает ≈ ${money(gap)}` : `Ваша вершина — ${money(amount)}. Что мешает — ниже`
          : `Ваша вершина ${money(amount)} в пределах доступного`}
      </Typography>
    </Box>
  );
}

// Что влияет на решение: строгий список, цвет — только у значка и метки
const toneIcon: Record<string, ReactNode> = { green: <Bolt />, amber: <Schedule />, red: <Block /> };

function FactorList({ precheck, amount, route }: { precheck: Precheck; amount: number; route?: { onOpen?: () => void; primary: boolean } }) {
  const reasons = (precheck.reasons ?? []).map((reason) => ({ text: reason.text, tone: reasonTone(reason.code), code: reason.code }));
  const alternative = precheck.amountHigh > 0 && amount > precheck.amountHigh;
  const counts = (["green", "amber", "red"] as const)
    .map((tone) => [tone, reasons.filter((r) => r.tone === tone).length + (tone === "green" && alternative ? 1 : 0)] as const)
    .filter(([, count]) => count > 0);
  return (
    <Box className="factors">
      <Box className="factors-head">
        <Typography className="factors-title">Что влияет на решение</Typography>
        <Box className="factors-counts">
          {counts.map(([tone, count]) => <span key={tone} className={`factors-count tone-${tone}`}><i />{count} · {toneLabel[tone].toLowerCase()}</span>)}
        </Box>
      </Box>
      <Box className="factors-list">
        {alternative && (
          <Box className="factor tone-green">
            <span className="factor-icon"><SwapVert /></span>
            <span className="factor-text">Сумма выше оценки. Ниже есть вариант до {money(precheck.amountHigh)} — по нему шансы выше</span>
            <button type="button" className="factor-tag factor-link" onClick={() => document.querySelector(".offers-list")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Показать</button>
          </Box>
        )}
        {reasons.map((reason, index) => (
          <Box key={reason.code ?? index} className={`factor tone-${reason.tone}`} style={{ animationDelay: `${index * 50}ms` }}>
            <span className="factor-icon">{toneIcon[reason.tone]}</span>
            <span className="factor-text">{reason.text}</span>
            <span className="factor-tag">{toneLabel[reason.tone]}</span>
          </Box>
        ))}
      </Box>
      {route && (
        <Box className="factors-route">
          <Button variant={route.primary ? "contained" : "outlined"} className="open-route-btn" endIcon={<ArrowForward />} onClick={route.onOpen}>
            Открыть маршрут без подачи
          </Button>
          <Typography className="factors-route-note">Заявка не создаётся, в БКИ не запрашиваем</Typography>
        </Box>
      )}
    </Box>
  );
}
