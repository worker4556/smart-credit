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
import type { CompanyPageProps } from "../types";
export default function CompanyPage({
  data,
  update,
  next,
  setToast,
}: CompanyPageProps) {
  return (
    <>
      <StepTitle
        eyebrow="ШАГ 3 ИЗ 7 · ДАННЫЕ КОМПАНИИ"
        title="Найдем вашу компанию"
        subtitle="ИНН — единственное, что нужно напечатать. Остальное подставим сами."
      />
      <Paper className="company-panel">
        <Box className="inn-entry">
          <Box className="field-label">
            <Typography fontWeight={700}>ИНН компании или ИП</Typography>
            <Tooltip title="ИНН указан в свидетельстве или на сайте ФНС">
              <IconButton size="small">
                <HelpOutline />
              </IconButton>
            </Tooltip>
          </Box>
          <TextField
            fullWidth
            value={data.inn}
            onChange={(e) => {
              update("inn", e.target.value.replace(/\D/g, "").slice(0, 12));
              update("companyOk", false);
            }}
            placeholder="Введите 10 или 12 цифр"
            helperText="ИНН: 10 цифр у компаний, 12 цифр у ИП. Он указан в свидетельстве или на сайте ФНС."
            InputProps={{
              endAdornment:
                data.inn.length >= 10 ? <CheckCircle color="success" /> : null,
            }}
          />
          <Button
            variant="outlined"
            onClick={() => {
              update("companyOk", true);
              setToast("Демо-данные компании загружены");
              setTimeout(() => setToast(""), 2500);
            }}
            disabled={data.inn.length !== 10 && data.inn.length !== 12}
            startIcon={<Autorenew />}
          >
            Найти компанию
          </Button>
        </Box>
        {data.companyOk && (
          <Box className="company-found">
            <Box className="company-title">
              <IconBubble lime>
                <Storefront />
              </IconBubble>
              <Box>
                <Typography className="eyebrow">
                  КОМПАНИЯ НАЙДЕНА · ДЕМО-ДАННЫЕ
                </Typography>
                <Typography variant="h5" fontWeight={800}>
                  ООО «Ромашка Трейд»
                </Typography>
              </Box>
              <Chip
                icon={<VerifiedUser />}
                label="Проверена"
                className="verified"
              />
            </Box>
            <Divider />
            <Box className="company-facts">
              <Box>
                <span>Деятельность</span>
                <b>Торговля продуктами</b>
              </Box>
              <Box>
                <span>Работает с</span>
                <b>2022 года</b>
              </Box>
              <Box>
                <span>Руководитель</span>
                <b>Иванов И. И. · Москва</b>
              </Box>
            </Box>
            <Alert severity="info" className="source-alert">
              Информация получена из демонстрационного реестра. Перед отправкой
              заявки проверьте, что это ваша компания.
            </Alert>
          </Box>
        )}
      </Paper>
      <FooterNav
        onBack={() => next(1)}
        onNext={() => next(3)}
        next="Да, это моя компания"
        disabled={!data.companyOk}
        note="Ваши данные сохраняются автоматически"
      />
    </>
  );
}
