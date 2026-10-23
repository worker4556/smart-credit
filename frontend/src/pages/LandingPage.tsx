import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Box, Button, Chip, Drawer, IconButton, LinearProgress, Paper, Typography } from "@mui/material";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import AccountCircleOutlined from "@mui/icons-material/AccountCircleOutlined";
import ArrowForward from "@mui/icons-material/ArrowForward";
import BoltOutlined from "@mui/icons-material/BoltOutlined";
import Close from "@mui/icons-material/Close";
import FilterDramaOutlined from "@mui/icons-material/FilterDramaOutlined";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import LandscapeOutlined from "@mui/icons-material/LandscapeOutlined";
import RouteOutlined from "@mui/icons-material/RouteOutlined";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import StarRounded from "@mui/icons-material/StarRounded";
import ChevronRight from "@mui/icons-material/ChevronRight";
import ExpandMore from "@mui/icons-material/ExpandMore";
import type { ApplicationData, RouteStep } from "../types";
import { formatMoney } from "../utils/format";

interface LandingPageProps {
  userName?: string;
  application?: ApplicationData;
  onStart: () => void;
  onProfile: () => void;
  onLogout?: () => void;
  onHome?: () => void;
}

const benefits = [
  { icon: <RouteOutlined />, title: "Понятный маршрут", text: "Видно, что уже готово и какие шаги помогут бизнесу." },
  { icon: <InsightsOutlined />, title: "Реальные условия", text: "Предварительная оценка опирается на данные компании." },
  { icon: <AccountBalanceWalletOutlined />, title: "Подготовка к решению", text: "Соберите заявку и передайте её на рассмотрение банка." },
  { icon: <ShieldOutlined />, title: "Надёжный проводник", text: "Данные заявки сохраняются по ходу заполнения." },
];

// ---------- времена года ----------

export type Season = "winter" | "spring" | "summer" | "autumn";
const SEASONS: Season[] = ["winter", "spring", "summer", "autumn"];

const SEASON_INFO: Record<Season, { name: string; short: string; tip: string }> = {
  winter: { name: "Зима", short: "Зимой у многих бизнесов спокойные месяцы — платёж подбираем с запасом.", tip: "После новогоднего пика у многих бизнесов спокойные месяцы. Выбирайте платёж, который комфортен и в слабый месяц." },
  spring: { name: "Весна", short: "Весной закупки к сезону — оборотный кредит удобнее подать заранее.", tip: "Время закупок к сезону. Если деньги нужны на товар, оборотный кредит удобнее подать заранее, до пика спроса." },
  summer: { name: "Лето", short: "Летом у сезонного бизнеса пик — хороший момент подтвердить обороты.", tip: "Для сезонного бизнеса — самые сильные месяцы. Хороший момент подтвердить обороты: банк видит их по счёту." },
  autumn: { name: "Осень", short: "На маршруте возможны изменения: например, сезонный спад спроса после лета.", tip: "После летнего сезона выручка у многих снижается. Планируйте платёж с запасом и не подавайте заявки в несколько банков сразу." },
};

export function seasonForDate(date = new Date()): Season {
  const m = date.getMonth();
  if (m === 11 || m <= 1) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "autumn";
}

function initialSeason(): Season {
  const fromUrl = new URLSearchParams(window.location.search).get("season");
  return SEASONS.includes(fromUrl as Season) ? (fromUrl as Season) : seasonForDate();
}

// ---------- метрики заявки: «высота», «вершина», варианты маршрута ----------

interface RouteVariant { key: string; icon: ReactNode; title: string; term: string; steps: RouteStep[]; }

function routeVariants(steps: RouteStep[]): RouteVariant[] {
  const quick = steps.filter((s) => /недел|сразу/i.test(s.term));
  const scale = steps.filter((s) => s.targetTurnover || /темп/i.test(s.term));
  const gradual = steps.filter((s) => !quick.includes(s) && !scale.includes(s));
  return [
    { key: "quick", icon: <BoltOutlined />, title: "Быстрый старт", term: "недели", steps: quick },
    { key: "gradual", icon: <LandscapeOutlined />, title: "Постепенный рост", term: "1–6 мес.", steps: gradual },
    { key: "scale", icon: <TrendingUpOutlined />, title: "Масштабирование", term: "по темпу роста", steps: scale },
  ].filter((v) => v.steps.length > 0);
}

function useMetrics(app?: ApplicationData) {
  return useMemo(() => {
    if (!app) return null;
    const decided = ["approved", "partial"].includes(app.outcome) && app.decisionAmount;
    const precheck = app.precheck;
    if (!decided && !precheck && !app.route) return null;   // метрики появляются, когда у клиента есть оценка или решение
    const summit = app.amount;
    // Высота — то, что доступно сейчас: решение банка или предоценка; прогноз маршрута — это не текущая высота
    const height = decided ? app.decisionAmount! : precheck?.amountHigh ?? 0;
    return {
      summit,
      height,
      heightLabel: decided ? "Доступно по решению банка" : "Доступно сейчас по предварительной оценке",
      heightRange: !decided && precheck && precheck.amountLow !== precheck.amountHigh ? `${formatMoney(precheck.amountLow)} – ${formatMoney(precheck.amountHigh)}` : null,
      progress: summit > 0 ? Math.min(100, Math.round((height / summit) * 100)) : 0,
      turnover: app.company?.averageMonthlyTurnover,
      goal: app.goal,
      variants: routeVariants(app.route?.steps ?? []),
      steps: app.route?.steps ?? [],
      projected: app.route?.projectedAmount ?? null,
      horizon: app.route?.horizonText,
      offers: app.goalOffers ?? precheck?.goalOffers ?? [],
      // До вершины не хватает, а маршрута ещё нет — показываем, что мешает, а не «лучший вариант»
      blockers: height < summit ? (precheck?.reasons ?? []).slice(0, 3).map((r) => r.text) : [],
    };
  }, [app]);
}

// ---------- Альпинист на горе: идёт по тропе по мере выполнения шагов маршрута ----------

const TRAIL = "M390 588 C540 620 660 624 800 590 S1020 505 1165 480 S1280 385 1388 188";
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

type Metrics = ReturnType<typeof useMetrics>;

/** Положение на тропе (0 — подножие, 1 — вершина): старт — сумма, доступная сейчас, финиш — прогноз маршрута.
 *  Шаги маршрута стоят привалами между ними; каждый выполненный шаг поднимает альпиниста к следующему привалу. */
function trailPlan(m: NonNullable<Metrics>) {
  const start = m.summit > 0 ? clamp(m.height / m.summit, 0, 1) : 0;
  const steps = m.steps;
  const finish = steps.length ? clamp(Math.max((m.projected ?? m.summit) / m.summit, start + 0.25), 0, 1) : start;
  const at = (i: number) => start + (finish - start) * (i / Math.max(steps.length, 1));
  const done = steps.filter((s) => s.done).length;
  return {
    climber: steps.length ? at(done) : start,
    stops: steps.map((s, i) => ({ t: at(i + 1), done: s.done, text: s.action })),
    done, total: steps.length,
  };
}

function MountainRoute({ metrics }: { metrics: Metrics }) {
  const pathRef = useRef<SVGPathElement>(null);
  const [, setMounted] = useState(false);
  // Координаты считаются по самой тропе; после монтирования — перерисовка, когда элемент уже в DOM
  useLayoutEffect(() => { setMounted(true); }, []);
  const len = pathRef.current?.getTotalLength() ?? 0;
  const point = (t: number) => {
    const el = pathRef.current;
    if (!el || !len) return { x: 390, y: 588 };
    const p = el.getPointAtLength(clamp(t) * len);
    return { x: p.x, y: p.y };
  };
  const plan = metrics ? trailPlan(metrics) : null;
  const hiker = point(plan?.climber ?? 0);
  const summit = point(1);
  const label = metrics
    ? plan && plan.total ? `Шагов пройдено: ${plan.done} из ${plan.total}` : `Доступно: ${formatMoney(metrics.height)}`
    : "Вы здесь";

  return <svg className="landing-route-overlay" viewBox="0 0 1774 887" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <filter id="trail-shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#0b1f2c" floodOpacity=".28" />
      </filter>
    </defs>
    <path ref={pathRef} d={TRAIL} fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="10 12" strokeLinecap="round" opacity=".9" />
    {plan && len > 0 && <path d={TRAIL} fill="none" stroke="#ef3124" strokeWidth="5" strokeLinecap="round"
      strokeDasharray={`${clamp(plan.climber) * len} ${len}`} className="trail-progress" />}
    {plan?.stops.map((s, i) => { const p = point(s.t); return <g key={i} transform={`translate(${p.x} ${p.y})`} filter="url(#trail-shadow)">
      <circle r="11" fill={s.done ? "#1f6f43" : "#fff"} stroke={s.done ? "#fff" : "#233746"} strokeWidth="4" />
      {s.done && <path d="M-4.5 0 l3 3 l6 -6.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      <title>{s.text}</title>
    </g>; })}
    <g transform={`translate(${summit.x} ${summit.y})`} filter="url(#trail-shadow)">
      <circle r="7" fill="#233746" />
      <path d="M0 -4 V-62" stroke="#233746" strokeWidth="4" strokeLinecap="round" />
      <path d="M2 -62 H40 L30 -51 L40 -40 H2 Z" fill="#ef3124" />
      <g transform="translate(-238 -150)"><rect width="220" height="68" rx="12" fill="#fff" />
        <text x="18" y="28" className="trail-label-title">Ваша цель</text>
        {metrics && <text x="18" y="54" className="trail-label-value">{formatMoney(metrics.summit)}</text>}</g>
    </g>
    <g className="trail-hiker" style={{ transform: `translate(${hiker.x}px, ${hiker.y}px)` }} filter="url(#trail-shadow)">
      <path d="M0 0 C-6 -14 -24 -26 -24 -44 A24 24 0 1 1 24 -44 C24 -26 6 -14 0 0 Z" fill="#ef3124" stroke="#fff" strokeWidth="4" />
      <circle cy="-44" r="9" fill="#fff" />
      <g transform={(plan?.climber ?? 0) > 0.78 ? "translate(-302 -40)" : "translate(32 -98)"}><rect width="270" height="68" rx="12" fill="#fff" />
        <text x="18" y="28" className="trail-label-title">Вы здесь</text>
        <text x="18" y="54" className="trail-label-value">{label}</text></g>
    </g>
  </svg>;
}

// ---------- Кредит, который клиенту дали: коротко, под горой, без больших графиков ----------

const CREDIT_STATUS: Record<string, string> = {
  APPROVED: "Одобрен — примите условия", COUNTER_OFFER: "Есть предложение банка", OFFER_ACCEPTED: "Условия приняты",
  SIGNED: "Договор подписан", DISBURSED: "Деньги на счёте",
};

function useCredit(app?: ApplicationData) {
  return useMemo(() => {
    if (!app?.status || !(app.status in CREDIT_STATUS) || !app.decisionAmount) return null;
    const amount = app.decisionAmount;
    const fullCost = app.decisionFullCost ?? 0;
    return {
      status: CREDIT_STATUS[app.status],
      issued: app.status === "DISBURSED",
      amount,
      requested: app.amount,
      monthly: app.decisionMonthly ?? 0,
      rate: app.decisionRate,
      term: app.decisionTerm ?? app.term,
      fullCost,
      principalShare: fullCost > 0 ? Math.round((amount / (amount + fullCost)) * 100) : 100,
    };
  }, [app]);
}

// Мини-график-горка: точки по X 0..240, по Y 0..80 (меньше — выше)
const RIDGE_NOW = [[0, 72], [28, 60], [52, 66], [84, 48], [110, 56], [140, 36], [168, 44], [204, 20], [240, 58]];
const RIDGE_GOAL = [[0, 76], [30, 70], [56, 72], [88, 58], [116, 62], [150, 40], [178, 46], [214, 10], [240, 40]];

function ridgeY(points: number[][], x: number) {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

function Ridge({ points, color, dotAt, flag }: { points: number[][]; color: string; dotAt?: number; flag?: boolean }) {
  const id = `ridge-${color.slice(1)}`;
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const peak = points.reduce((a, b) => (b[1] < a[1] ? b : a));
  const dx = dotAt != null ? 8 + clamp(dotAt) * 224 : 0;
  return <svg className="ridge" viewBox="0 0 240 80" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".42" /><stop offset="1" stopColor={color} stopOpacity=".04" /></linearGradient></defs>
    <polygon points={`0,80 ${line} 240,80`} fill={`url(#${id})`} />
    <polyline points={line} fill="none" stroke={color} strokeOpacity=".55" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    {dotAt != null && <circle cx={dx} cy={ridgeY(points, dx)} r="4.5" fill={color} stroke="#fff" strokeWidth="2" />}
    {flag && <g transform={`translate(${peak[0]} ${peak[1]})`}><path d="M0 0 V-14" stroke={color} strokeWidth="1.6" /><path d="M0 -14 H9 L6.5 -11 L9 -8 H0 Z" fill={color} /></g>}
  </svg>;
}

interface DashRow { icon: ReactNode; title: string; value: string; }

function RouteDashboard({ metrics, credit, onOpenRoute }: {
  metrics: NonNullable<Metrics>; credit: ReturnType<typeof useCredit>; onOpenRoute: () => void;
}) {
  let title = "Варианты маршрута";
  let rows: DashRow[];
  if (credit) {
    title = "Ваш кредит";
    rows = [
      { icon: <BoltOutlined />, title: "Платёж в месяц", value: formatMoney(credit.monthly) },
      { icon: <LandscapeOutlined />, title: "Ставка и срок", value: `${credit.rate ?? "—"}% · ${credit.term} мес.` },
      { icon: <StarRounded />, title: "Полная стоимость", value: formatMoney(credit.fullCost) },
    ];
  } else if (metrics.variants.length) {
    rows = metrics.variants.map((v) => ({ icon: v.key === "quick" ? <BoltOutlined /> : v.key === "gradual" ? <LandscapeOutlined /> : <StarRounded />, title: v.title, value: v.term }));
  } else if (metrics.blockers.length) {
    title = "Что мешает дойти до вершины";
    rows = metrics.blockers.map((text) => ({ icon: <LandscapeOutlined />, title: text, value: "" }));
  } else {
    rows = metrics.offers.slice(0, 3).map((o, i) => ({ icon: i === 0 ? <BoltOutlined /> : <LandscapeOutlined />, title: o.name, value: typeof o.amount === "number" ? formatMoney(o.amount) : String(o.amount) }));
  }
  const reached = metrics.progress >= 100;
  return <Box className="dash">
    <Paper className="dash-card">
      <Typography className="dash-title">Ваша текущая высота</Typography>
      <Box className="dash-figures">
        <Box><Typography className="dash-value">{formatMoney(credit?.amount ?? metrics.height)}</Typography><Typography className="dash-sub">{credit ? credit.status : "Доступно сейчас"}</Typography></Box>
        <Box className="dash-trend"><Typography className={reached ? "dash-trend-value up" : "dash-trend-value"}>{reached ? "↑ " : ""}{metrics.progress}%</Typography><Typography className="dash-sub">пути до вершины</Typography></Box>
      </Box>
      <Ridge points={RIDGE_NOW} color="#6f7bdc" dotAt={metrics.progress / 100} />
    </Paper>
    <Paper className="dash-card">
      <Typography className="dash-title">Желаемая вершина</Typography>
      <Box className="dash-figures"><Box><Typography className="dash-value">{formatMoney(metrics.summit)}</Typography><Typography className="dash-sub">{metrics.goal}</Typography></Box></Box>
      <Ridge points={RIDGE_GOAL} color="#ef3124" flag />
    </Paper>
    <Paper className="dash-card dash-list-card">
      <Box className="dash-list-head"><Typography className="dash-title">{title}</Typography>
        <IconButton size="small" className="dash-more" onClick={onOpenRoute} aria-label="Открыть маршрут подробно"><ChevronRight /></IconButton></Box>
      <Box className="dash-list">
        {rows.map((r, i) => <Box key={i} className={i === 0 ? "dash-row dash-row-first" : "dash-row"}>
          <span className="dash-row-icon">{r.icon}</span><b>{r.title}</b><span className="dash-row-value">{r.value}</span>
        </Box>)}
      </Box>
    </Paper>
  </Box>;
}

function ConditionsBar({ season, onDetails }: { season: Season; onDetails: () => void }) {
  return <Paper className="conditions-bar">
    <Box className="conditions-icon"><FilterDramaOutlined /></Box>
    <Box className="conditions-copy"><b>Учитываем условия пути</b><span>{SEASON_INFO[season].short}</span></Box>
    <Button variant="outlined" className="conditions-more" endIcon={<ExpandMore />} onClick={onDetails}>Посмотреть детали</Button>
  </Paper>;
}

export default function LandingPage({ userName, application, onStart, onProfile, onLogout, onHome }: LandingPageProps) {
  const [season, setSeason] = useState<Season>(initialSeason);
  const [panel, setPanel] = useState<"metrics" | "conditions" | null>(null);
  const metrics = useMetrics(application);
  const credit = useCredit(application);
  const close = () => setPanel(null);

  return <Box className={`landing-page season-${season}`}>
    <Box component="header" className="landing-header">
      <Box className="landing-brand" component="button" type="button" onClick={onHome} aria-label="Перейти на заглавную страницу"><Box className="brand-mark">а</Box><Box><b>альфа-бизнес</b><span>КРЕДИТНЫЙ КАБИНЕТ</span></Box></Box>
      <Box className="landing-nav"><Button onClick={onStart}>Кредит для бизнеса</Button><Button onClick={onProfile}>Мой бизнес</Button><Button onClick={onStart}>Документы</Button><Button onClick={onStart}>Поддержка</Button></Box>
      <Button className="landing-account-top" onClick={onProfile} startIcon={<AccountCircleOutlined />}>
        <span>{userName ?? "Личный кабинет"}<small>{userName ? "Мои данные и компания" : "Войти в аккаунт"}</small></span>
      </Button>
      {userName && onLogout && <Button className="landing-logout" onClick={onLogout}>Выйти</Button>}
    </Box>

    <Box component="main" className="landing-main">
      {/* Гора — главный образ: на ней только маршрут, всё остальное выезжает по запросу */}
      <Box className="landing-hero">
        <Box className="landing-hero-art" aria-hidden="true">
          <img src="/images/mountain-route-hero.png" alt="" />
          <Box className="season-tint" />
          <Box className="season-particles" />
          <MountainRoute metrics={metrics} />
        </Box>
        <Box className="landing-hero-shade" />
        <Box className="landing-hero-copy">
          <Chip icon={<FlagOutlined />} label="Кредитные продукты для бизнеса" className="landing-kicker" />
          <Typography component="h1">Ваш путь к новым высотам</Typography>
          <Typography className="landing-lead">Помогаем выбрать подходящее финансирование и пройти весь путь — от идеи до решения банка.</Typography>
          <Button variant="contained" size="large" endIcon={<ArrowForward />} onClick={onStart}>{application?.submitted ? "Открыть мою заявку" : metrics ? "Продолжить заявку" : "Подобрать кредит"}</Button>
        </Box>

      </Box>

      {metrics ? <RouteDashboard metrics={metrics} credit={credit} onOpenRoute={() => setPanel("metrics")} /> : <Box className="landing-benefits">
        {benefits.map((benefit) => <Paper key={benefit.title} className="landing-benefit">
          <Box className="landing-benefit-icon">{benefit.icon}</Box>
          <Typography fontWeight={800}>{benefit.title}</Typography>
          <Typography color="text.secondary">{benefit.text}</Typography>
        </Paper>)}
      </Box>}
      <ConditionsBar season={season} onDetails={() => setPanel("conditions")} />
    </Box>

    <Drawer anchor="right" open={panel === "metrics" && !!metrics} onClose={close} PaperProps={{ className: "landing-drawer" }}>
      {metrics && <Box className="landing-drawer-body">
        <Box className="landing-drawer-head"><Typography component="h2">Мой маршрут</Typography><IconButton onClick={close} aria-label="Закрыть"><Close /></IconButton></Box>

        <Paper className="landing-metric">
          <Typography className="eyebrow">ВАША ТЕКУЩАЯ ВЫСОТА</Typography>
          <Typography className="landing-metric-value">{formatMoney(metrics.height)}</Typography>
          <Typography color="text.secondary">{metrics.heightLabel}{metrics.heightRange ? `: ${metrics.heightRange}` : ""}</Typography>
          {metrics.turnover ? <Typography className="landing-metric-note">Оборот по счёту — около {formatMoney(metrics.turnover)} в месяц</Typography> : null}
        </Paper>

        <Paper className="landing-metric">
          <Typography className="eyebrow">ЖЕЛАЕМАЯ ВЕРШИНА</Typography>
          <Typography className="landing-metric-value">{formatMoney(metrics.summit)}</Typography>
          <Typography color="text.secondary">{metrics.goal}</Typography>
          <LinearProgress variant="determinate" value={metrics.progress} className="landing-metric-progress" aria-label="Пройдено до вершины" />
          <Typography className="landing-metric-note">{metrics.progress >= 100 ? "Вершина доступна" : `Пройдено ${metrics.progress}% пути`}</Typography>
        </Paper>

        <Paper className="landing-metric">
          <Typography className="eyebrow">{metrics.variants.length === 0 && metrics.blockers.length > 0 ? "ЧТО МЕШАЕТ ДОЙТИ ДО ВЕРШИНЫ" : "ВАРИАНТЫ МАРШРУТА"}</Typography>
          {metrics.variants.length > 0
            ? metrics.variants.map((v) => <Box key={v.key} className="landing-variant">
                <Box className="landing-variant-icon">{v.icon}</Box>
                <Box><b>{v.title}</b><small>{v.steps.map((s) => s.action).join(" · ")}</small></Box>
                <span>{v.term}</span>
              </Box>)
            : metrics.blockers.length > 0
              ? <>
                  {metrics.blockers.map((text, i) => <Box key={i} className="landing-variant">
                    <Box className="landing-variant-icon"><LandscapeOutlined /></Box>
                    <Box><b>{text}</b></Box>
                    <span />
                  </Box>)}
                  <Typography className="landing-metric-note">Шаги и сроки, которые снимут эти препятствия, — в маршруте на шаге «Предложение».</Typography>
                </>
            : metrics.offers.length > 0
              ? metrics.offers.slice(0, 3).map((o, i) => <Box key={i} className="landing-variant">
                  <Box className="landing-variant-icon">{i === 0 ? <FlagOutlined /> : <LandscapeOutlined />}</Box>
                  <Box><b>{o.name}</b><small>{typeof o.amount === "number" ? formatMoney(o.amount) : o.amount}{o.termMonths ? ` · ${o.termMonths} мес.` : ""}</small></Box>
                  <span>{i === 0 ? "лучший" : ""}</span>
                </Box>)
              : <Typography color="text.secondary">Маршрут не нужен: по текущим данным вершина доступна.</Typography>}
          {metrics.horizon && <Typography className="landing-metric-note">Ориентир: {metrics.horizon}. Это не обещание одобрения.</Typography>}
        </Paper>

        <Button variant="contained" endIcon={<ArrowForward />} onClick={() => { close(); onStart(); }}>Открыть заявку</Button>
      </Box>}
    </Drawer>

    <Drawer anchor="right" open={panel === "conditions"} onClose={close} PaperProps={{ className: "landing-drawer" }}>
      <Box className="landing-drawer-body">
        <Box className="landing-drawer-head"><Typography component="h2">Условия пути</Typography><IconButton onClick={close} aria-label="Закрыть"><Close /></IconButton></Box>
        <Paper className="landing-metric">
          <Typography className="eyebrow">СЕЙЧАС · {SEASON_INFO[season].name.toUpperCase()}</Typography>
          <Typography>{SEASON_INFO[season].tip}</Typography>
        </Paper>
        <Paper className="landing-metric">
          <Typography className="eyebrow">ПОГОДА НА МАРШРУТЕ</Typography>
          <Typography color="text.secondary">Сколько будет стоить кредит, если ставка вырастет или платёж задержится, покажем на шаге «Предложение» — рядом с вашими условиями.</Typography>
        </Paper>
        <Box className="landing-season-switch" role="group" aria-label="Оформление по времени года">
          {SEASONS.map((s) => <Button key={s} size="small" variant={s === season ? "contained" : "outlined"} onClick={() => setSeason(s)}>{SEASON_INFO[s].name}</Button>)}
        </Box>
      </Box>
    </Drawer>
  </Box>;
}
