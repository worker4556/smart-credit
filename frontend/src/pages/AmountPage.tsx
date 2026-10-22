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
import { needsRoute } from "../utils/route";
export default function AmountPage({
  data,
  update,
  next,
  monthly,
  total,
  amountError,
}: AmountPageProps) {
  const isOverdraft = data.goal.includes("кассов");
  const term = isOverdraft ? 12 : data.term;
  return (
    <>
      <StepTitle
        eyebrow="ШАГ 3 ИЗ 7 · СУММА И СРОК"
        title="Сколько вам нужно?"
        subtitle="Сумму и срок можно будет изменить позже."
      />
      {needsRoute(data.precheck, data.amount) && (
        <RouteMap
          compact
          targetAmount={data.amount}
          currentAmount={data.precheck?.amountHigh}
        />
      )}
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
                  update("amount", Math.min(3000000, Math.max(100000, v)));
              }}
              InputProps={{
                endAdornment: <Typography color="text.secondary">₽</Typography>,
              }}
            />
          </Box>
          {amountError && <Typography color="error" variant="body2" sx={{ mt: 1 }}>{amountError}</Typography>}
          <Divider className="calc-divider" />
          {!isOverdraft && <>
          <Box className="range-head">
            <Box>
              <Typography fontWeight={700}>На сколько месяцев</Typography>
              <Typography variant="body2" color="text.secondary">Чем дольше срок, тем меньше платеж</Typography>
            </Box>
            <Chip label={`${term} мес.`} className="term-chip" />
          </Box>
          <Slider
            min={6} max={36} step={1} value={term}
            onChange={(_, v) => update("term", v)} aria-label="Срок кредита"
          />
          <Box className="range-hints"><span>6 месяцев</span><span>36 месяцев</span></Box>
          </>}
          {isOverdraft && <Typography variant="body2" color="text.secondary">Срок овердрафта — 12 месяцев</Typography>}
          <Alert icon={<LightbulbOutlined />} className="calc-hint">
            Для вашей цели чаще всего берут от 500 тыс. до 2 млн ₽ на 6–12
            месяцев.
          </Alert>
        </Paper>
        <Paper className="payment-card">
          <Typography className="payment-kicker">
            ПРЕДВАРИТЕЛЬНЫЙ РАСЧЕТ · ПРЕДВАРИТЕЛЬНО
          </Typography>
          <Typography variant="h3" className="payment-value">
            {data.quote ? money(monthly) : "—"}
            {data.quote && <span> / мес.</span>}
          </Typography>
          <Typography color="text.secondary">
            Предварительный ежемесячный платеж
          </Typography>
          <Divider />
          <Box className="pay-row">
            <span>Всего вернете банку</span>
            <b>{data.quote ? money(total) : "—"}</b>
          </Box>
          <Box className="pay-row">
            <span>Условия расчёта</span>
            <b>Получены от банка</b>
          </Box>
          <Box className="rate-note">
            <ShieldOutlined fontSize="small" /> Предварительный расчёт
          </Box>
        </Paper>
      </Box>
      <FooterNav
        onBack={() => next(1)}
        onNext={() => next(3)}
        note="Расчёт обновляется автоматически"
      />
    </>
  );
}
