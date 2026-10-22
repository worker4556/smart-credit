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
import type { ReviewPageProps } from "../types";
export default function ReviewPage({
  data,
  update,
  next,
  monthly,
  submit,
  loading,
}: ReviewPageProps) {
  return (
    <>
      <StepTitle
        eyebrow="ШАГ 7 ИЗ 7 · ФИНИШНАЯ ПРЯМАЯ"
        title="Проверьте и отправляйте"
        subtitle="Убедитесь, что всё верно. Изменить данные можно в любой момент."
      />
      <Box className="review-layout">
        <Paper className="review-panel">
          <Box className="review-block">
            <Box className="review-icon">
              <AccountBalanceWallet />
            </Box>
            <Box className="review-copy">
              <Typography className="eyebrow">ЧТО ВЫ ПРОСИТЕ</Typography>
              <Typography fontWeight={750}>
                {data.goal} · {money(data.amount)} · {data.term} месяцев
              </Typography>
              <Typography color="text.secondary">
                Платеж около {money(monthly)} в месяц
              </Typography>
            </Box>
            <Button onClick={() => next(2)}>Изменить</Button>
          </Box>
          <Divider />
          <Box className="review-block">
            <Box className="review-icon">
              <Storefront />
            </Box>
            <Box className="review-copy">
              <Typography className="eyebrow">О КОМПАНИИ</Typography>
              <Typography fontWeight={750}>
                {data.company?.name ?? "Компания"} · ИНН {data.inn}
              </Typography>
              <Typography color="text.secondary">
                Выручка {data.monthlyRevenue.toLocaleString("ru-RU")} ₽ в месяц
                · кредиты: {data.hasLoans.toLowerCase()}
              </Typography>
            </Box>
            <Button onClick={() => next(3)}>Изменить</Button>
          </Box>
          <Divider />
          <Box className="review-block">
            <Box className="review-icon">
              <DescriptionOutlined />
            </Box>
            <Box className="review-copy">
              <Typography className="eyebrow">ДОКУМЕНТЫ</Typography>
              <Typography fontWeight={750}>
                Паспорт руководителя, налоговая отчетность
              </Typography>
              <Typography color="text.secondary">
                {Object.values(data.docs).filter(Boolean).length} файла
                загружено · остальное получим сами
              </Typography>
            </Box>
            <Button onClick={() => next(5)}>Изменить</Button>
          </Box>
        </Paper>
        <Paper className="consent-panel">
          <Typography variant="h6" fontWeight={800}>
            Остался один шаг
          </Typography>
          <Typography color="text.secondary">
            Подтвердите согласия, чтобы мы начали проверку.
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={data.consent1}
                onChange={(e) => update("consent1", e.target.checked)}
              />
            }
            label="Разрешаю банку обработать данные о компании и руководителе"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={data.consent2}
                onChange={(e) => update("consent2", e.target.checked)}
              />
            }
            label="Разрешаю банку посмотреть историю кредитов компании"
          />
          <Divider />
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={submit}
            disabled={!data.consent1 || !data.consent2 || loading}
          >
            Отправить заявку <ArrowForward />
          </Button>
          <Typography variant="caption" color="text.secondary">
            Нажимая кнопку, вы подтверждаете указанные согласия и отправляете заявку.
          </Typography>
        </Paper>
      </Box>
      <Box className="privacy-note">
        <ShieldOutlined /> Мы покажем статус здесь же. Пока ничего делать не
        придется.
      </Box>
      <FooterNav
        onBack={() => next(5)}
        onNext={submit}
        next="Отправить заявку"
        disabled={!data.consent1 || !data.consent2 || loading}
      />
    </>
  );
}
