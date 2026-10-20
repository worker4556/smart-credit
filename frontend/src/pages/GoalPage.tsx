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
import type { PageProps } from "../types";
import RouteMap from "../components/RouteMap";

export default function GoalPage({ data, update, next }: PageProps) {
  return (
    <>
      <StepTitle
        eyebrow="ВАШ ПЛАН · НАЧАЛО МАРШРУТА"
        title="Путь к финансированию начинается с вашего плана"
        subtitle="Покажем текущую оценку, возможную вершину и шаги, которые помогут приблизиться к ней."
      />
      <RouteMap />
      <Box className="route-overview">
        <Box>
          <Typography className="eyebrow">ПРЕДВАРИТЕЛЬНАЯ ОЦЕНКА</Typography>
          <Typography variant="h5" fontWeight={800}>
            Шансы: средние
          </Typography>
          <Typography color="text.secondary">
            Оценка по демонстрационному профилю, не обещание решения.
          </Typography>
        </Box>
        <Box>
          <Typography className="eyebrow">ЧТО ВЛИЯЕТ НА МАРШРУТ</Typography>
          <Typography>
            Стабильность выручки · история платежей · финансовые документы
          </Typography>
          <Typography color="text.secondary">
            Часть данных уточним по ходу заявки.
          </Typography>
        </Box>
      </Box>
      <Typography className="goal-prompt">
        Сначала расскажите, для чего бизнесу финансирование
      </Typography>
      <Box className="goal-grid">
        {goals.map(([t, s, i], n) => (
          <SelectCard
            key={t}
            selected={data.goal === t}
            onClick={() => update("goal", t)}
            icon={
              i === "receipt" ? (
                <ReceiptLong />
              ) : i === "store" ? (
                <Storefront />
              ) : i === "help" ? (
                <HelpOutline />
              ) : (
                <AccountBalanceWallet />
              )
            }
            title={t}
            subtitle={s}
            badge={n === 0 ? "Частый выбор" : undefined}
          />
        ))}
      </Box>
      <FooterNav
        back={false}
        onNext={() => next(1)}
        next="Дальше"
        note="≈ 10 секунд"
      />
    </>
  );
}
