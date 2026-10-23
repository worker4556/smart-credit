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
import type { DocumentsPageProps } from "../types";
export default function DocumentsPage({
  data,
  update,
  next,
  uploadFile,
}: DocumentsPageProps) {
  const requiredDocumentsUploaded = Boolean(data.docs.passport && data.docs.tax);
  return (
    <>
      <StepTitle
        eyebrow="ШАГ 5 ИЗ 6 · ДОКУМЕНТЫ"
        title="Нужны только эти документы"
        subtitle="Все остальное мы уже получили сами. Можно загрузить сейчас или вернуться позже."
      />
      <Paper className="docs-panel">
        <Box className="docs-progress">
          <Box>
            <Typography className="eyebrow">ГОТОВНОСТЬ ДОКУМЕНТОВ</Typography>
            <Typography fontWeight={800}>
              {Object.values(data.docs).filter(Boolean).length + 2} из 4 готово
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={
              ((2 + Object.values(data.docs).filter(Boolean).length) / 4) * 100
            }
          />
        </Box>
        <Box className="doc-row">
          <IconBubble lime>
            <CheckCircle />
          </IconBubble>
          <Box className="doc-copy">
            <Typography fontWeight={750}>
              Выписка из реестра о вашей компании
            </Typography>
            <Typography color="text.secondary">
              Получили сами, ничего делать не нужно
            </Typography>
          </Box>
          <Chip label="Получено" className="doc-done" />
        </Box>
        <Box className="doc-row">
          <IconBubble lime>
            <CheckCircle />
          </IconBubble>
          <Box className="doc-copy">
            <Typography fontWeight={750}>
              Обороты по счету в нашем банке
            </Typography>
            <Typography color="text.secondary">Получили сами</Typography>
          </Box>
          <Chip label="Получено" className="doc-done" />
        </Box>
        {[
          [
            "passport",
            "Паспорт руководителя",
            "Фото или скан главной страницы",
          ],
          [
            "tax",
            "Налоговая отчетность за последний год",
            "PDF, XLSX или фото",
          ],
        ].map(([id, title, sub]) => (
          <Box key={id} className="doc-row">
            <IconBubble>
              <DescriptionOutlined />
            </IconBubble>
            <Box className="doc-copy">
              <Typography fontWeight={750}>{title}</Typography>
              <Typography color="text.secondary">
                {data.docs[id] || sub}
              </Typography>
            </Box>
            <Button
              component="label"
              variant={data.docs[id] ? "outlined" : "contained"}
              startIcon={data.docs[id] ? <CheckCircle /> : <CloudUpload />}
            >
              {data.docs[id] ? "Заменить файл" : "Загрузить"}
              <input
                hidden
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void uploadFile(file, id);
                }}
              />
            </Button>
          </Box>
        ))}
        <Alert className="secure-alert" icon={<ShieldOutlined />}>
          Документы передаются по защищенному соединению и доступны только
          банку.
        </Alert>
        {!requiredDocumentsUploaded && <Alert severity="warning" className="required-docs-alert">
          Чтобы продолжить, загрузите паспорт руководителя и налоговую отчетность.
        </Alert>}
      </Paper>
      <FooterNav
        onBack={() => next(3)}
        onNext={() => next(5)}
        next="Дальше"
        disabled={!requiredDocumentsUploaded}
        note={requiredDocumentsUploaded ? "Обязательные документы загружены" : "Загрузите паспорт и налоговую отчетность"}
      />
    </>
  );
}
