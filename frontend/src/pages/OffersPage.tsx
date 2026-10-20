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
import type { OffersPageProps } from "../types";
export default function OffersPage({
  data,
  update,
  next,
  goalOffers,
  selectedOffer,
  setSelectedOffer,
  monthly,
  chosen,
  setToast: _setToast,
}: OffersPageProps) {
  return (
    <>
      <StepTitle
        eyebrow="ШАГ 5 ИЗ 7 · ПОДБОР ДЛЯ ВАС"
        title="Вот что нам подходит"
        subtitle="Сравните варианты. Все условия пока предварительные."
      />
      {data.precheck && (
        <Paper className="precheck-card">
          <Box className="precheck-amounts">
            <Box>
              <Typography className="eyebrow">ТЕКУЩАЯ ВЫСОТА</Typography>
              <Typography variant="h5" fontWeight={800}>
                {money(data.precheck.amountLow)} — {money(data.precheck.amountHigh)}
              </Typography>
            </Box>
            <Box>
              <Typography className="eyebrow">ВАША ВЕРШИНА</Typography>
              <Typography variant="h5" fontWeight={800}>
                {money(data.amount)}
              </Typography>
            </Box>
            <Box>
              <Typography className="eyebrow">ПРЕДВАРИТЕЛЬНЫЙ ШАНС</Typography>
              <Typography variant="h5" fontWeight={800}>
                {data.precheck.chance}
              </Typography>
            </Box>
          </Box>
          {(data.precheck.reasons ?? []).map((reason, index) => (
            <Typography key={reason.code ?? index} className="precheck-reason">
              • {reason.text}
            </Typography>
          ))}
          <Typography className="precheck-explanation">
            {data.precheck.text}
          </Typography>
          <Typography className="precheck-disclaimer">
            {data.precheck.disclaimer ?? "Это оценка по текущим данным, а не решение банка. Действует 30 дней"}
          </Typography>
        </Paper>
      )}
      {goalOffers.length === 0 && (
        <Paper className="empty-offers">
          <Typography variant="h6" fontWeight={800}>
            Пока нет подходящих предложений
          </Typography>
          <Typography color="text.secondary">
            Можно отправить заявку на проверку или вернуться и изменить сумму и
            срок.
          </Typography>
        </Paper>
      )}
      <Box className="offers-layout">
        <Box className="offers-list">
          {goalOffers.map((o, i) => (
            <Card
              key={o.name}
              onClick={() => {
                setSelectedOffer(i);
                update("offer", i);
              }}
              className={`offer-card ${selectedOffer === i ? "offer-selected" : ""} ${i === 0 ? "offer-best" : ""}`}
            >
              <CardContent>
                <Box className="offer-topline">
                  {i === 0 && (
                    <Chip
                      label="★  ЛУЧШИЙ ВАРИАНТ"
                      size="small"
                      className="best-chip"
                    />
                  )}
                  <Radio checked={selectedOffer === i} />
                </Box>
                <Typography variant="h5" fontWeight={800}>
                  {o.name}
                </Typography>
                <Typography className="offer-amount">{o.amount}</Typography>
                <Typography color="text.secondary">{o.detail}</Typography>
                <Box className="offer-explain">
                  <CheckCircle fontSize="small" />
                  <span>
                    {o.why && <><b>Почему подходит:</b> {o.why}</>}
                  </span>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
        <Paper className="recommend-card">
          <Typography className="eyebrow">ВАШ ВЫБОР</Typography>
          {chosen ? (
            <>
              <Typography variant="h5" fontWeight={800}>
                {chosen.name}
              </Typography>
              <Typography variant="h4" className="rec-payment">
                {chosen.amount || money(monthly)}
              </Typography>
              <Typography color="text.secondary">
                {selectedOffer === 0
                  ? "в месяц · предварительно"
                  : "подходящее предложение"}
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="h5" fontWeight={800}>
                Нет подходящего предложения
              </Typography>
              <Typography color="text.secondary">
                Заявку всё равно можно отправить на проверку.
              </Typography>
            </>
          )}
          <Divider />
          <Typography fontWeight={700}>Что понадобится</Typography>
          <Stack spacing={1} className="needed-list">
            <Box>
              <CheckCircle />
              Паспорт руководителя
            </Box>
            <Box>
              <CheckCircle />
              Налоговая отчетность
            </Box>
          </Stack>
          <Button
            variant="contained"
            fullWidth
            onClick={() => next(5)}
            endIcon={<ArrowForward />}
          >
            {chosen ? "Выбрать этот вариант" : "Продолжить без предложения"}
          </Button>
          <Button variant="text" color="inherit" onClick={() => next(1)}>
            Изменить сумму или срок
          </Button>
          <Typography className="mini-disclaimer">
            Окончательные условия назовем после проверки заявки.
          </Typography>
        </Paper>
      </Box>
      <Box className="catalog-teaser">
        <Typography variant="h6" fontWeight={800}>
          В каталоге также есть
        </Typography>
        <Typography color="text.secondary">
          Кредит на оборудование · Рефинансирование · Льготные программы
          поддержки бизнеса
        </Typography>
        <Typography variant="body2" color="text.secondary">Дополнительные продукты доступны в каталоге банка.</Typography>
      </Box>
      <FooterNav
        onBack={() => next(3)}
        onNext={() => next(5)}
        next={
          goalOffers.length
            ? "Продолжить с выбранным вариантом"
            : "Продолжить без предложения"
        }
      />
    </>
  );
}
