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
import { defaultData, goals } from "../data/application";
import RouteMap from "../components/RouteMap";
import type { StatusPageProps } from "../types";
export default function StatusPage({
  data,
  update,
  setData,
  setScreen,
  next,
  monthly,
  total,
}: StatusPageProps) {
  return (
    <>
      <Box className="status-hero">
        <Box>
          <Chip
            label={
              data.outcome === "approved"
                ? "РЕШЕНИЕ ГОТОВО"
                : "ЗАЯВКА № A-000123"
            }
            className="status-number"
          />
          <Typography variant="h2" className="status-title">
            {data.outcome === "approved"
              ? "Заявка одобрена"
              : data.outcome === "partial"
                ? "Можем дать меньше"
                : data.outcome === "rejected"
                  ? "Сейчас не можем одобрить"
                  : "Проверяем вашу заявку"}
          </Typography>
          <Typography className="status-lead">
            {data.outcome === "approved"
              ? `Вам одобрено ${money(data.amount)} на ${data.term} месяцев. Платеж около ${money(monthly)} в месяц.`
              : data.outcome === "partial"
                ? `Предлагаем ${money(Math.round(data.amount * 0.7))} на ${data.term} месяцев. Это предварительное решение.`
                : data.outcome === "rejected"
                  ? "Пока не можем предложить кредит на этих условиях. Попробуйте изменить сумму или срок."
                  : "Сверяем данные о компании и кредитную историю. Вам не нужно ничего делать."}
          </Typography>
        </Box>
        <Box className="status-snapshot">
          <Typography className="eyebrow">МАРШРУТ ЗАЯВКИ</Typography>
          <Typography variant="h4">
            {data.outcome === "partial" ? "600 000 ₽" : money(data.amount)}
          </Typography>
          <Typography color="text.secondary">
            {data.outcome === "partial"
              ? "доступный демо-лимит"
              : "желаемая сумма"}
          </Typography>
          <Box className="snapshot-line">
            <span />
            Текущая контрольная точка
          </Box>
        </Box>
      </Box>
      <Box className="status-content">
        <Paper className="timeline-panel">
          <Typography variant="h5" fontWeight={800}>
            Что происходит
          </Typography>
          <Typography color="text.secondary">
            Обычно отвечаем в течение рабочего дня
          </Typography>
          <Box className="timeline">
            {[
              "Заявка принята",
              "Проверяем данные",
              "Оцениваем заявку",
              "Решение",
            ].map((x, i) => (
              <Box
                className={`timeline-step ${data.outcome !== "review" || i < 2 ? "complete" : ""} ${data.outcome === "review" && i === 2 ? "active" : ""}`}
                key={x}
              >
                <Box className="timeline-mark">
                  {data.outcome !== "review" || i < 1 ? (
                    <CheckCircle />
                  ) : i === 1 ? (
                    <Autorenew />
                  ) : (
                    i + 1
                  )}
                </Box>
                <Typography fontWeight={700}>{x}</Typography>
                <Typography variant="caption">
                  {i === 0
                    ? "14:02 · только что"
                    : i === 1
                      ? "Сверяем данные"
                      : "Ожидаем"}
                </Typography>
              </Box>
            ))}
          </Box>
          <Divider />
          <Box className="what-now">
            <IconBubble lime>
              <CheckCircle />
            </IconBubble>
            <Box>
              <Typography fontWeight={750}>Что делать вам</Typography>
              <Typography color="text.secondary">
                Ничего. Мы сообщим здесь, если понадобится ваша помощь.
              </Typography>
            </Box>
          </Box>
        </Paper>
        <Paper className="personal-card">
          <IconBubble>
            <LightbulbOutlined />
          </IconBubble>
          <Typography className="eyebrow">ДЛЯ ВАС</Typography>
          <Typography variant="h5" fontWeight={800}>
            Как подготовить бизнес к кредиту
          </Typography>
          <Typography color="text.secondary">
            Несколько простых советов, которые могут повысить шансы на
            одобрение.
          </Typography>
          <Button endIcon={<ArrowForward />}>Читать статью</Button>
          <Divider />
          <Typography variant="caption" color="text.secondary">
            Суммы и условия в этом кабинете демонстрационные.
          </Typography>
        </Paper>
      </Box>
      <Paper className="decision-route-panel">
        <RouteMap
          compact
          restricted={data.outcome === "partial" || data.outcome === "rejected"}
          currentLabel={
            data.outcome === "approved"
              ? "Одобренная сумма"
              : "Доступная высота"
          }
          summitLabel="Запрошенная сумма"
        />
        {data.outcome === "partial" && (
          <Box className="route-decision">
            <Box>
              <Typography className="eyebrow">ГДЕ ИЗМЕНИЛСЯ МАРШРУТ</Typography>
              <Typography fontWeight={800}>
                На запрошенную сумму условия не выполнены
              </Typography>
              <Typography color="text.secondary">
                В демонстрационном сценарии доступен меньший лимит — 600 000 ₽.
                Это пример альтернативы, а не реальное решение банка.
              </Typography>
            </Box>
            <Button
              variant="contained"
              onClick={() => update("outcome", "approved")}
            >
              Посмотреть условия
            </Button>
          </Box>
        )}
        {data.outcome === "rejected" && (
          <Box className="route-decision">
            <Box>
              <Typography className="eyebrow">СЛЕДУЮЩИЙ ПРИВАЛ</Typography>
              <Typography fontWeight={800}>
                Сейчас подходящего предложения нет
              </Typography>
              <Typography color="text.secondary">
                Проверьте историю платежей и поддерживайте стабильные обороты.
                Повторная оценка может быть полезна через 3 месяца, если условия
                бизнеса изменятся. Срок ориентировочный.
              </Typography>
            </Box>
            <Chip label="Повторная оценка · ориентир 3 месяца" />
          </Box>
        )}
        {data.outcome === "approved" && (
          <Box className="route-decision">
            <Box>
              <Typography className="eyebrow">ВЕРШИНА ДОСТИГНУТА</Typography>
              <Typography fontWeight={800}>
                Условия готовы к ознакомлению
              </Typography>
              <Typography color="text.secondary">
                Проверьте сумму, срок и ежемесячный платеж перед подтверждением.
              </Typography>
            </Box>
            <Button variant="contained">Принять условия</Button>
          </Box>
        )}
      </Paper>
      <Paper className="history-panel">
        <Typography fontWeight={800}>История заявки</Typography>
        <Stack direction="row" spacing={2} className="history-entry">
          <CheckCircle color="success" />
          <Typography>14:02 · Заявка отправлена и принята</Typography>
          <Typography color="text.secondary">Сегодня</Typography>
        </Stack>
        <Stack direction="row" spacing={2} className="history-entry">
          <Autorenew color="primary" />
          <Typography>14:03 · Началась проверка данных</Typography>
          <Typography color="text.secondary">Сегодня</Typography>
        </Stack>
      </Paper>
      {data.outcome === "review" && (
        <Box className="demo-controls">
          <Typography variant="caption">
            ДЕМО: показать пример решения
          </Typography>
          <Button size="small" onClick={() => update("outcome", "approved")}>
            Одобрено
          </Button>
          <Button size="small" onClick={() => update("outcome", "partial")}>
            Меньшая сумма
          </Button>
          <Button size="small" onClick={() => update("outcome", "rejected")}>
            Отказ
          </Button>
        </Box>
      )}
      {data.outcome !== "review" && (
        <FooterNav
          back={false}
          onNext={() => {
            setData(defaultData);
            localStorage.removeItem("credit-demo");
            setScreen(0);
          }}
          next="Новая заявка"
        />
      )}
    </>
  );
}
