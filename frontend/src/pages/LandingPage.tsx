import { useMemo, useState, type ReactNode } from "react";
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

const SEASON_INFO: Record<Season, { name: string; tip: string }> = {
  winter: { name: "Зима", tip: "После новогоднего пика у многих бизнесов спокойные месяцы. Выбирайте платёж, который комфортен и в слабый месяц." },
  spring: { name: "Весна", tip: "Время закупок к сезону. Если деньги нужны на товар, оборотный кредит удобнее подать заранее, до пика спроса." },
  summer: { name: "Лето", tip: "Для сезонного бизнеса — самые сильные месяцы. Хороший момент подтвердить обороты: банк видит их по счёту." },
  autumn: { name: "Осень", tip: "После летнего сезона выручка у многих снижается. Планируйте платёж с запасом и не подавайте заявки в несколько банков сразу." },
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
    const height = decided ? app.decisionAmount! : precheck?.amountHigh ?? app.route?.projectedAmount ?? 0;
    return {
      summit,
      height,
      heightLabel: decided ? "Доступно по решению банка" : "Доступно сейчас по предварительной оценке",
      heightRange: !decided && precheck && precheck.amountLow !== precheck.amountHigh ? `${formatMoney(precheck.amountLow)} – ${formatMoney(precheck.amountHigh)}` : null,
      progress: summit > 0 ? Math.min(100, Math.round((height / summit) * 100)) : 0,
      turnover: app.company?.averageMonthlyTurnover,
      goal: app.goal,
      variants: routeVariants(app.route?.steps ?? []),
      horizon: app.route?.horizonText,
      offers: app.goalOffers ?? precheck?.goalOffers ?? [],
      // До вершины не хватает, а маршрута ещё нет — показываем, что мешает, а не «лучший вариант»
      blockers: height < summit ? (precheck?.reasons ?? []).slice(0, 3).map((r) => r.text) : [],
    };
  }, [app]);
}

export default function LandingPage({ userName, application, onStart, onProfile, onLogout, onHome }: LandingPageProps) {
  const [season, setSeason] = useState<Season>(initialSeason);
  const [panel, setPanel] = useState<"metrics" | "conditions" | null>(null);
  const metrics = useMetrics(application);
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
          <svg className="landing-route-overlay" viewBox="0 0 1774 887" preserveAspectRatio="xMidYMid slice">
            <path d="M390 588 C540 620 660 624 800 590 S1020 505 1165 480 S1280 385 1388 188" fill="none" stroke="#fff" strokeWidth="5" strokeDasharray="12 13" strokeLinecap="round" opacity=".95" />
            <circle cx="390" cy="588" r="15" fill="#ef3124" stroke="#fff" strokeWidth="7" />
            <circle cx="800" cy="590" r="13" fill="#ef3124" stroke="#fff" strokeWidth="7" />
            <circle cx="1165" cy="480" r="13" fill="#ef3124" stroke="#fff" strokeWidth="7" />
            <circle cx="1388" cy="188" r="18" fill="#ef3124" stroke="#fff" strokeWidth="8" />
          </svg>
          <Box className="landing-map-pin landing-pin-start"><b>Вы здесь</b>{metrics && <small>{formatMoney(metrics.height)}</small>}</Box>
          <Box className="landing-map-pin landing-pin-summit"><b>Ваша цель</b>{metrics && <small>{formatMoney(metrics.summit)}</small>}</Box>
        </Box>
        <Box className="landing-hero-shade" />
        <Box className="landing-hero-copy">
          <Chip icon={<FlagOutlined />} label="Кредитные продукты для бизнеса" className="landing-kicker" />
          <Typography component="h1">Ваш путь к новым высотам</Typography>
          <Typography className="landing-lead">Помогаем выбрать подходящее финансирование и пройти весь путь — от идеи до решения банка.</Typography>
          <Button variant="contained" size="large" endIcon={<ArrowForward />} onClick={onStart}>{metrics ? "Продолжить заявку" : "Подобрать кредит"}</Button>
        </Box>

        {/* Язычки выдвижных панелей у края картинки */}
        <Box className="landing-edge-tabs">
          {metrics && <Button className="landing-edge-tab" onClick={() => setPanel("metrics")} startIcon={<RouteOutlined />}>Мой маршрут</Button>}
          <Button className="landing-edge-tab" onClick={() => setPanel("conditions")} startIcon={<FilterDramaOutlined />}>Условия пути</Button>
        </Box>
      </Box>

      <Box className="landing-benefits">
        {benefits.map((benefit) => <Paper key={benefit.title} className="landing-benefit">
          <Box className="landing-benefit-icon">{benefit.icon}</Box>
          <Typography fontWeight={800}>{benefit.title}</Typography>
          <Typography color="text.secondary">{benefit.text}</Typography>
        </Paper>)}
      </Box>
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
