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
import {
  FooterNav,
  IconBubble,
  SelectCard,
  StepTitle,
} from "../components/ApplicationShell";
import { formatMoney as money, formatNumber as format } from "../utils/format";
import { goals } from "../data/application";
import type { AmountPageProps } from "../types";
import RouteMap from "../components/RouteMap";
export default function AmountPage({
  data,
  update,
  next,
  monthly,
  total,
}: AmountPageProps) {
  return (
    <>
      <StepTitle
        eyebrow="ШАГ 2 ИЗ 7 · СУММА И СРОК"
        title="Сколько вам нужно?"
        subtitle="Сумму и срок можно будет изменить позже."
      />
      <RouteMap compact />
      <Box className="calc-layout">
        <Paper className="calc-main">
          <Box className="range-head">
            <Typography fontWeight={700}>Сумма</Typography>
            <TextField
              className="amount-input"
              value={format(data.amount)}
              onChange={(e) => {
                const v = Number(e.target.value.replace(/\D/g, ""));
                if (v >= 0)
                  update("amount", Math.min(5000000, Math.max(100000, v)));
              }}
              InputProps={{
                endAdornment: <Typography color="text.secondary">₽</Typography>,
              }}
            />
          </Box>
          <Slider
            min={100000}
            max={5000000}
            step={50000}
            value={data.amount}
            onChange={(_, v) => update("amount", v)}
            aria-label="Сумма кредита"
          />
          <Box className="range-hints">
            <span>100 000 ₽</span>
            <span>5 000 000 ₽</span>
          </Box>
          <Divider className="calc-divider" />
          <Box className="range-head">
            <Box>
              <Typography fontWeight={700}>На сколько месяцев</Typography>
              <Typography variant="body2" color="text.secondary">
                Чем дольше срок, тем меньше платеж
              </Typography>
            </Box>
            <Chip label={`${data.term} мес.`} className="term-chip" />
          </Box>
          <Slider
            min={3}
            max={36}
            step={1}
            value={data.term}
            onChange={(_, v) => update("term", v)}
            aria-label="Срок кредита"
          />
          <Box className="range-hints">
            <span>3 месяца</span>
            <span>36 месяцев</span>
          </Box>
          <Alert icon={<LightbulbOutlined />} className="calc-hint">
            Для вашей цели чаще всего берут от 500 тыс. до 2 млн ₽ на 6–12
            месяцев.
          </Alert>
        </Paper>
        <Paper className="payment-card">
          <Typography className="payment-kicker">
            ПРЕДВАРИТЕЛЬНЫЙ РАСЧЕТ
          </Typography>
          <Typography variant="h3" className="payment-value">
            {money(monthly)}
            <span> / мес.</span>
          </Typography>
          <Typography color="text.secondary">
            Одинаковый платеж каждый месяц
          </Typography>
          <Divider />
          <Box className="pay-row">
            <span>Всего вернете банку</span>
            <b>{money(total)}</b>
          </Box>
          <Box className="pay-row">
            <span>Из них проценты</span>
            <b>{money(total - data.amount)}</b>
          </Box>
          <Box className="rate-note">
            <ShieldOutlined fontSize="small" /> Демо-ставка 22% годовых · расчет
            не является офертой
          </Box>
          <Box className="meter-label">
            <span>Оценка готовности маршрута</span>
            <b>Средняя</b>
          </Box>
          <LinearProgress
            variant="determinate"
            value={54}
            className="chance-progress"
          />
        </Paper>
      </Box>
      <FooterNav
        onBack={() => next(0)}
        onNext={() => next(2)}
        note="Демо-расчет по ставке 22% годовых"
      />
    </>
  );
}
