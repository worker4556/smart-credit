import {
  Box,
  Typography,
  AppBar,
  Toolbar,
  Button,
  Paper,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Radio,
  Avatar,
  IconButton,
  FormControl,
  MenuItem,
  Select,
} from "@mui/material";
import AccountBalanceWallet from "@mui/icons-material/AccountBalanceWallet";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ArrowForward from "@mui/icons-material/ArrowForward";
import CheckCircle from "@mui/icons-material/CheckCircle";
import ChevronRight from "@mui/icons-material/ChevronRight";
import HelpOutline from "@mui/icons-material/HelpOutline";
import MenuIcon from "@mui/icons-material/Menu";
import ReceiptLong from "@mui/icons-material/ReceiptLong";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import Storefront from "@mui/icons-material/Storefront";
import type { ReactNode } from "react";
import type { Navigate } from "../types";

interface IconBubbleProps {
  children: ReactNode;
  lime?: boolean;
}
interface HeaderProps {
  screen: number;
  setScreen: (screen: number) => void;
  userName?: string;
  openProfile?: () => void;
  demoAccounts?: Array<{ id: string; label: string }>;
  selectedDemoId?: string;
  onDemoAccountChange?: (id: string) => void;
  onLogout?: () => void;
}
interface StepTitleProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
}
interface FooterNavProps {
  onBack?: () => void;
  onNext: () => void;
  next?: string;
  disabled?: boolean;
  back?: boolean;
  note?: string;
}
interface SelectCardProps {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
}

export function IconBubble({ children, lime = false }: IconBubbleProps) {
  return <Box className={`icon-bubble ${lime ? "lime" : ""}`}>{children}</Box>;
}
export function Header({ screen, setScreen, userName = "Клиент", openProfile, demoAccounts = [], selectedDemoId = "P1", onDemoAccountChange, onLogout }: HeaderProps) {
  return (
    <AppBar position="sticky" color="inherit" elevation={0} className="appbar">
      <Toolbar className="toolbar">
        <Box className="brand" onClick={() => setScreen(0)}>
          <Box className="brand-mark">а</Box>
          <Box>
            <Typography className="brand-name">альфа-бизнес</Typography>
            <Typography className="brand-caption">КРЕДИТНЫЙ КАБИНЕТ</Typography>
          </Box>
        </Box>
        <Box className="navlinks">
          <Button
            className={screen < 7 ? "nav-active" : ""}
            onClick={() => setScreen(0)}
          >
            Кредит
          </Button>
          <Button onClick={() => setScreen(7)}>Мои заявки</Button>
          <Button>Помощь</Button>
        </Box>
        <Box className="head-actions">
          <FormControl size="small" className="demo-account-picker">
            <Select value={selectedDemoId} onChange={(event) => onDemoAccountChange?.(event.target.value)} aria-label="Демо-аккаунт">
              {demoAccounts.map((account) => <MenuItem key={account.id} value={account.id}>{account.label}</MenuItem>)}
            </Select>
          </FormControl>
          <Button
            className="profile-link"
            component="a"
            href="/profile"
            onClick={(event) => {
              event.preventDefault();
              openProfile?.();
            }}
            aria-label="Открыть личный кабинет"
          >
            <Avatar className="user-avatar">{userName.slice(0, 1).toLocaleUpperCase()}</Avatar>
            <Box className="user-name">{userName}<br /><span>Личный кабинет</span></Box>
          </Button>
          <Button onClick={onLogout} className="logout-button">Выйти</Button>
          <IconButton className="menu-mobile">
            <MenuIcon />
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
export function StepRail({ screen, setScreen }: HeaderProps) {
  const labels = [
    "Цель",
    "Сумма",
    "Компания",
    "Финансы",
    "Предложение",
    "Документы",
    "Отправка",
  ];
  return (
    <Box className="step-rail">
      <Box className="rail-top">
        <Typography variant="overline">НОВАЯ ЗАЯВКА</Typography>
        <Typography className="rail-count">
          {Math.min(screen + 1, 7)} <span>/ 7</span>
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={screen === 7 ? 100 : ((screen + 1) / 7) * 100}
        className="rail-progress"
      />
      <Stack className="rail-list">
        {labels.map((l, i) => (
          <Box
            key={l}
            className={`rail-item ${screen === i ? "current" : ""} ${screen > i || screen === 7 ? "done" : ""}`}
          >
            <Box className="rail-dot">
              {screen > i || screen === 7 ? (
                <CheckCircle fontSize="small" />
              ) : (
                <span>0{i + 1}</span>
              )}
            </Box>
            <Typography>{l}</Typography>
            {screen === i && <ChevronRight className="rail-chevron" />}
          </Box>
        ))}
      </Stack>
      <Paper className="rail-help">
        <IconBubble>
          <ShieldOutlined />
        </IconBubble>
        <Typography fontWeight={700}>Ваши данные под защитой</Typography>
        <Typography variant="body2" color="text.secondary">
          Сохраняем каждый шаг. Продолжите в любое время.
        </Typography>
        <Button endIcon={<ArrowForward />} onClick={() => setScreen(7)}>
          Мои заявки
        </Button>
      </Paper>
      <Typography className="rail-foot">Альфа-Бизнес</Typography>
    </Box>
  );
}
export function StepTitle({ eyebrow, title, subtitle }: StepTitleProps) {
  return (
    <Box className="step-title">
      <Typography className="eyebrow">{eyebrow}</Typography>
      <Typography variant="h2">{title}</Typography>
      {subtitle && <Typography className="subtitle">{subtitle}</Typography>}
    </Box>
  );
}
export function FooterNav({
  onBack,
  onNext,
  next = "Продолжить",
  disabled = false,
  back = true,
  note,
}: FooterNavProps) {
  return (
    <Box className="footer-nav">
      {back ? (
        <Button
          variant="text"
          color="inherit"
          startIcon={<ArrowBack />}
          onClick={onBack}
          className="back-btn"
        >
          Назад
        </Button>
      ) : (
        <Box />
      )}
      <Box className="footer-right">
        {note && (
          <Typography variant="caption" className="footnote">
            {note}
          </Typography>
        )}
        <Button
          variant="contained"
          onClick={onNext}
          disabled={disabled}
          endIcon={<ArrowForward />}
        >
          {next}
        </Button>
      </Box>
    </Box>
  );
}
export function SelectCard({
  selected,
  onClick,
  icon,
  title,
  subtitle,
  badge,
}: SelectCardProps) {
  return (
    <Card
      onClick={onClick}
      className={`select-card ${selected ? "selected" : ""}`}
    >
      <CardContent>
        <Box className="select-card-top">
          <IconBubble lime={selected}>{icon}</IconBubble>
          <Radio checked={selected} color="primary" />
        </Box>
        <Typography className="card-title">{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
        {badge && <Chip label={badge} size="small" className="card-badge" />}
      </CardContent>
    </Card>
  );
}
