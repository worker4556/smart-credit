import { Box, Chip, Paper, TextField, Typography } from "@mui/material";
import Autorenew from "@mui/icons-material/Autorenew";
import { FooterNav, StepTitle } from "../components/ApplicationShell";
import type { FinancePageProps } from "../types";

export default function FinancePage({
  data,
  update,
  next,
  company,
  onShowOffers,
}: FinancePageProps) {
  const accountTurnover = company?.averageMonthlyTurnover ?? 0;

  return (
    <>
      <StepTitle
        eyebrow="ШАГ 4 ИЗ 7 · ФИНАНСЫ"
        title="Немного о финансах"
        subtitle="Точные цифры не нужны — укажите примерный среднемесячный оборот."
      />
      <Box className="finance-grid">
        <Paper className="question-card">
          <Typography fontWeight={750}>
            Сколько денег приходит от клиентов в месяц?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Выручка — все деньги от продаж до вычета расходов.
          </Typography>
          <TextField
            fullWidth
            type="number"
            label="Выручка в месяц"
            value={data.monthlyRevenue || ""}
            onChange={(event) =>
              update("monthlyRevenue", Number(event.target.value))
            }
            InputProps={{
              endAdornment: <Typography color="text.secondary">₽</Typography>,
            }}
            sx={{ mt: 2 }}
          />
          {accountTurnover > 0 && (
            <Typography className="auto-note">
              <Autorenew fontSize="small" /> По счёту у вас около{" "}
              {accountTurnover.toLocaleString("ru-RU")} ₽ в месяц — верно?
              <Chip
                size="small"
                label="Подставить"
                onClick={() => update("monthlyRevenue", accountTurnover)}
              />
            </Typography>
          )}
        </Paper>
        <Paper className="question-card">
          <Typography fontWeight={750}>
            Есть ли сейчас другие кредиты?
          </Typography>
          <Box className="option-pills">
            {(["Нет", "Да"] as const).map((answer) => (
              <Chip
                key={answer}
                onClick={() => update("hasLoans", answer)}
                label={answer}
                className={`option-pill ${data.hasLoans === answer ? "active" : ""}`}
              />
            ))}
          </Box>
          {data.hasLoans === "Да" && (
            <TextField
              fullWidth
              type="number"
              label="Платежи по кредитам в месяц"
              value={data.loanPayment || ""}
              onChange={(event) =>
                update("loanPayment", Number(event.target.value))
              }
              InputProps={{
                endAdornment: <Typography color="text.secondary">₽</Typography>,
              }}
              sx={{ mt: 2 }}
            />
          )}
        </Paper>
        <Paper className="question-card wide">
          <Typography fontWeight={750}>
            Были ли просрочки по кредитам за последние 2 года?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Этот ответ поможет точнее оценить заявку. БКИ до подачи не
            запрашиваем.
          </Typography>
          <Box className="option-pills">
            {([false, true] as const).map((overdue) => (
              <Chip
                key={String(overdue)}
                onClick={() => update("hadOverdue2y", overdue)}
                label={overdue ? "Да" : "Нет"}
                className={`option-pill ${data.hadOverdue2y === overdue ? "active" : ""}`}
              />
            ))}
          </Box>
        </Paper>
      </Box>
      <FooterNav
        onBack={() => next(2)}
        onNext={onShowOffers}
        next="Показать предложения"
        note="≈ 40 секунд"
      />
    </>
  );
}
