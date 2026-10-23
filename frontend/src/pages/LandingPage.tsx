import { Box, Button, Chip, Paper, Typography } from "@mui/material";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import AccountCircleOutlined from "@mui/icons-material/AccountCircleOutlined";
import ArrowForward from "@mui/icons-material/ArrowForward";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import RouteOutlined from "@mui/icons-material/RouteOutlined";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";

interface LandingPageProps {
  userName?: string;
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

export default function LandingPage({ userName, onStart, onProfile, onLogout, onHome }: LandingPageProps) {
  return <Box className="landing-page">
    <Box component="header" className="landing-header">
      <Box className="landing-brand" component="button" type="button" onClick={onHome} aria-label="Перейти на заглавную страницу"><Box className="brand-mark">а</Box><Box><b>альфа-бизнес</b><span>КРЕДИТНЫЙ КАБИНЕТ</span></Box></Box>
      <Box className="landing-nav"><Button onClick={onStart}>Кредит для бизнеса</Button><Button onClick={onProfile}>Мой бизнес</Button><Button onClick={onStart}>Документы</Button><Button onClick={onStart}>Поддержка</Button></Box>
      <Button className="landing-account-top" onClick={onProfile} startIcon={<AccountCircleOutlined />}>
        <span>{userName ?? "Личный кабинет"}<small>{userName ? "Мои данные и компания" : "Войти в аккаунт"}</small></span>
      </Button>
      {userName && onLogout && <Button className="landing-logout" onClick={onLogout}>Выйти</Button>}
    </Box>

    <Box component="main" className="landing-main">
      <Box className="landing-hero">
        <Box className="landing-hero-art" aria-hidden="true">
          <img src="/images/mountain-route-hero.png" alt="" />
          <svg className="landing-route-overlay" viewBox="0 0 1774 887" preserveAspectRatio="xMidYMid slice">
            <path d="M390 588 C540 620 660 624 800 590 S1020 505 1165 480 S1280 385 1388 188" fill="none" stroke="#fff" strokeWidth="5" strokeDasharray="12 13" strokeLinecap="round" opacity=".95" />
            <circle cx="390" cy="588" r="15" fill="#ef3124" stroke="#fff" strokeWidth="7" />
            <circle cx="800" cy="590" r="13" fill="#ef3124" stroke="#fff" strokeWidth="7" />
            <circle cx="1165" cy="480" r="13" fill="#ef3124" stroke="#fff" strokeWidth="7" />
            <circle cx="1388" cy="188" r="18" fill="#ef3124" stroke="#fff" strokeWidth="8" />
          </svg>
          <Box className="landing-map-pin landing-pin-start"><b>Текущая высота</b><small>Вы здесь</small></Box>
          <Box className="landing-map-pin landing-pin-rest"><b>Привал</b><small>Оцените ресурсы</small></Box>
          <Box className="landing-map-pin landing-pin-check"><b>Контрольная точка</b><small>Планирование и документы</small></Box>
          <Box className="landing-map-pin landing-pin-summit"><b>Ваша цель</b><small>Новая высота бизнеса</small></Box>
        </Box>
        <Box className="landing-hero-shade" />
        <Box className="landing-hero-copy">
          <Chip icon={<FlagOutlined />} label="Кредитные продукты для бизнеса" className="landing-kicker" />
          <Typography component="h1">Ваш путь к новым высотам</Typography>
          <Typography className="landing-lead">Помогаем выбрать подходящее финансирование и пройти весь путь — от идеи до решения банка.</Typography>
          <Button variant="contained" size="large" endIcon={<ArrowForward />} onClick={onStart}>Подобрать кредит</Button>
        </Box>
        <Paper className="landing-route-card">
          <Typography className="eyebrow">ВАШ МАРШРУТ</Typography>
          <Box><FlagOutlined /><span><b>Вершина</b><small>Новый уровень бизнеса</small></span></Box>
          <Box><RouteOutlined /><span><b>Контрольные точки</b><small>Цели и этапы развития</small></span></Box>
          <Box><InsightsOutlined /><span><b>Текущая высота</b><small>Оценка по данным бизнеса</small></span></Box>
          <Typography className="landing-route-note">Учитываем ваши возможности и реальные обстоятельства.</Typography>
          <Button onClick={onStart} endIcon={<ArrowForward />}>Посмотреть маршрут</Button>
        </Paper>
      </Box>

      <Box className="landing-benefits">
        {benefits.map((benefit) => <Paper key={benefit.title} className="landing-benefit">
          <Box className="landing-benefit-icon">{benefit.icon}</Box>
          <Typography fontWeight={800}>{benefit.title}</Typography>
          <Typography color="text.secondary">{benefit.text}</Typography>
        </Paper>)}
      </Box>

      <Paper className="landing-map-panel">
        <Box className="landing-map-copy"><Typography className="eyebrow">ШАГ ЗА ШАГОМ</Typography><Typography component="h2">От плана к финансированию</Typography><Typography color="text.secondary">Расскажите о задаче бизнеса, подтвердите данные и получите предварительные варианты от банка.</Typography></Box>
        <Button variant="contained" endIcon={<ArrowForward />} onClick={onStart}>Начать заявку</Button>
      </Paper>
    </Box>

    <Box component="footer" className="landing-footer">
      <Typography>© Альфа-Бизнес · Кредитный кабинет</Typography>
      <Button onClick={onStart}>Кредит для бизнеса <ArrowForward /></Button>
    </Box>
  </Box>;
}
