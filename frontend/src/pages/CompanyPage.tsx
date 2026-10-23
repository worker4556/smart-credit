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
  lookupCompany,
  profileCompany,
}: CompanyPageProps) {
  const accountCompany = [data.company, profileCompany].find((company) => company?.inn === data.inn);
  return (
    <>
      <StepTitle
        eyebrow="ШАГ 2 ИЗ 6 · ДАННЫЕ КОМПАНИИ"
        title="Найдем вашу компанию"
        subtitle="ИНН — единственное, что нужно напечатать. Остальное подставим сами."
      />
      <Paper className="company-panel">
        {data.inn && !data.companyOk && <Alert severity="info" sx={{ mb: 2 }}>ИНН загружен из личного кабинета. Проверьте данные компании.</Alert>}
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
              update("company", undefined);
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
            onClick={async () => {
              try {
                const company = await lookupCompany(data.inn);
                update("company", company);
                update("companyOk", true);
                setToast("Данные компании загружены");
                setTimeout(() => setToast(""), 2500);
              } catch (error) {
                setToast(
                  error instanceof Error
                    ? error.message
                    : "Не удалось найти компанию",
                );
                setTimeout(() => setToast(""), 3500);
              }
            }}
            disabled={data.inn.length !== 10 && data.inn.length !== 12}
            startIcon={<Autorenew />}
          >
            Найти компанию
          </Button>
        </Box>
        {data.companyOk || accountCompany ? (
          <Box className="company-found">
            <Box className="company-title">
              <IconBubble lime>
                <Storefront />
              </IconBubble>
              <Box>
                <Typography className="eyebrow">
                  ПРОВЕРЬТЕ КОМПАНИЮ
                </Typography>
                <Typography variant="h5" fontWeight={800}>
                  {data.company?.name ?? accountCompany?.name ?? "Компания найдена"}
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
                <b>{data.company?.activity ?? accountCompany?.activity ?? "Деятельность будет уточнена"}</b>
              </Box>
              <Box>
                <span>Работает с</span>
                <b>{data.company?.registrationYear ?? accountCompany?.registrationYear ?? "—"} года</b>
              </Box>
              <Box>
                <span>Регион</span>
                <b>{data.company?.region ?? accountCompany?.region ?? "Регион будет уточнен"}</b>
              </Box>
            </Box>
            <Alert severity="info" className="source-alert">Проверьте, что это ваша компания, и подтвердите выбор.</Alert>
          </Box>
        ) : null}
      </Paper>
      <FooterNav
        onBack={() => next(0)}
        onNext={() => {
          if (accountCompany) {
            update("company", accountCompany);
            update("companyOk", true);
          }
          next(2);
        }}
        next="Да, это моя компания"
        disabled={!data.companyOk && !accountCompany}
        note="Ваши данные сохраняются автоматически"
      />
    </>
  );
}
