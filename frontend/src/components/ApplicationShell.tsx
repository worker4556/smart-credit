import { Menu, MenuItem } from "@mui/material";
import { useState } from "react";
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
  setScreen: (screen: number) => void | Promise<void>;
  userName?: string;
  openProfile?: () => void;
  openHome?: () => void;
  openHelp?: () => void;
  openApplication?: (screen: number) => void;
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
  secondary?: { label: string; onClick: () => void };
}
interface SelectCardProps {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  className?: string;
}

export function IconBubble({ children, lime = false }: IconBubbleProps) {
  return <Box className={`icon-bubble ${lime ? "lime" : ""}`}>{children}</Box>;
}
export function Header({ screen, setScreen, userName = "Клиент", openProfile, openHome, openHelp, openApplication, onLogout }: HeaderProps) {
  // На узком экране ссылки шапки спрятаны — открываем их из меню
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const go = (action?: () => void) => { setMenuAnchor(null); action?.(); };
  return (
    <AppBar position="sticky" color="inherit" elevation={0} className="appbar">
      <Toolbar className="toolbar">
        <Box className="brand" component="button" type="button" onClick={openHome ?? (() => (openApplication ? openApplication(0) : setScreen(0)))} aria-label="Перейти на заглавную страницу">
          <Box className="brand-mark">а</Box>
          <Box>
            <Typography className="brand-name">альфа-бизнес</Typography>
            <Typography className="brand-caption">КРЕДИТНЫЙ КАБИНЕТ</Typography>
          </Box>
        </Box>
        <Box className="navlinks">
          <Button
            className={screen < 6 ? "nav-active" : ""}
            onClick={() => openApplication ? openApplication(0) : setScreen(0)}
          >
            Кредит
          </Button>
          <Button onClick={() => openApplication ? openApplication(6) : setScreen(6)}>Мои заявки</Button>
          <Button onClick={openHelp}>Помощь</Button>
        </Box>
        <Box className="head-actions">
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
          <IconButton className="menu-mobile" aria-label="Меню" onClick={(event) => setMenuAnchor(event.currentTarget)}>
            <MenuIcon />
          </IconButton>
          <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
            <MenuItem onClick={() => go(() => (openApplication ? openApplication(0) : setScreen(0)))}>Кредит</MenuItem>
            <MenuItem onClick={() => go(() => (openApplication ? openApplication(6) : setScreen(6)))}>Мои заявки</MenuItem>
            <MenuItem onClick={() => go(openHelp)}>Помощь</MenuItem>
            <MenuItem onClick={() => go(openProfile)}>Личный кабинет</MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
export function StepRail({ screen, setScreen }: HeaderProps) {
  const labels = [
    "Цель",
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
          {Math.min(screen + 1, 6)} <span>/ 6</span>
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={screen === 6 ? 100 : ((screen + 1) / 6) * 100}
        className="rail-progress"
      />
      <Stack className="rail-list">
        {labels.map((l, i) => (
          <Box
            key={l}
            component="button"
            type="button"
            disabled={i >= screen}
            onClick={() => void setScreen(i)}
            aria-current={screen === i ? "step" : undefined}
            className={`rail-item ${screen === i ? "current" : ""} ${screen > i || screen === 6 ? "done" : ""}`}
          >
            <Box className="rail-dot">
              {screen > i || screen === 6 ? (
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
        <Button endIcon={<ArrowForward />} onClick={() => setScreen(6)}>
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
  secondary,
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
        {secondary && (
          <Button variant="outlined" color="inherit" onClick={secondary.onClick}>
            {secondary.label}
          </Button>
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
  className,
}: SelectCardProps) {
  return (
    <Card
      onClick={onClick}
      className={`select-card ${selected ? "selected" : ""} ${className ?? ""}`}
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
