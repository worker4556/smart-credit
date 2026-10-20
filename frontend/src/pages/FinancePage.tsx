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
import type { FinancePageProps } from "../types";
export default function FinancePage({
  data,
  update,
  next,
  setSelectedOffer,
}: FinancePageProps) {
  return (
    <>
      <StepTitle
        eyebrow="ШАГ 4 ИЗ 7 · НЕСКОЛЬКО ВОПРОСОВ"
        title="Немного о финансах"
        subtitle="Точные цифры не нужны, достаточно примерно."
      />
      <Box className="finance-grid">
        <Paper className="question-card">
          <Typography fontWeight={750}>
            Сколько денег приходит от клиентов за год?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Выручка — все деньги от продаж до вычета расходов.
          </Typography>
          <Box className="option-pills">
            {[
              "до 3 млн ₽",
              "3–10 млн ₽",
              "10–30 млн ₽",
              "30–120 млн ₽",
              "больше 120 млн ₽",
            ].map((o) => (
              <Chip
                key={o}
                onClick={() => update("revenue", o)}
                label={o}
                className={`option-pill ${data.revenue === o ? "active" : ""}`}
              />
            ))}
          </Box>
          <Typography className="auto-note">
            <Autorenew fontSize="small" /> Если вы обслуживаетесь у нас,
            подставим обороты по счету
          </Typography>
        </Paper>
        <Paper className="question-card">
          <Typography fontWeight={750}>
            Есть ли сейчас другие кредиты?
          </Typography>
          <Box className="option-pills">
            {(["Нет", "Да"] as const).map((o) => (
              <Chip
                key={o}
                onClick={() => update("hasLoans", o)}
                label={o}
                className={`option-pill ${data.hasLoans === o ? "active" : ""}`}
              />
            ))}
          </Box>
          {data.hasLoans === "Да" && (
            <TextField
              fullWidth
              type="number"
              label="Сколько платите по ним в месяц?"
              value={data.loanPayment || ""}
              onChange={(e) => update("loanPayment", Number(e.target.value))}
              InputProps={{
                endAdornment: <Typography color="text.secondary">₽</Typography>,
              }}
            />
          )}
        </Paper>
        <Paper className="question-card wide">
          <Typography fontWeight={750}>
            Что можно оставить банку в обеспечение, если потребуется?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Обеспечение — имущество, которое помогает получить кредит. Можно
            ничего.
          </Typography>
          <Box className="option-pills">
            {[
              "Ничего",
              "Оборудование или транспорт",
              "Недвижимость",
              "Товар на складе",
              "Не знаю",
            ].map((o) => (
              <Chip
                key={o}
                onClick={() => update("collateral", o)}
                label={o}
                className={`option-pill ${data.collateral === o ? "active" : ""}`}
              />
            ))}
          </Box>
        </Paper>
      </Box>
      <FooterNav
        onBack={() => next(2)}
        onNext={() => {
          setSelectedOffer(0);
          update("offer", 0);
          next(4);
        }}
        next="Показать предложения"
        note="≈ 40 секунд"
      />
    </>
  );
}
