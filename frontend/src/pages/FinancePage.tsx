import { Box, Chip, Paper, TextField, Typography } from "@mui/material";
import Autorenew from "@mui/icons-material/Autorenew";
import { FooterNav, StepTitle } from "../components/ApplicationShell";
import type { ApplicationData, FinancePageProps } from "../types";
import { DEBT_MAX_POINTS, PAYMENT_SHARE_LIMIT, debtPoints, debtTone, paymentTone, percent, share, type Tone } from "../utils/finance";
import { formatMoney } from "../utils/format";

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
        eyebrow="ШАГ 3 ИЗ 6 · ФИНАНСЫ"
        title="Немного о финансах"
        subtitle="Шаг можно пропустить: обороты по счёту мы видим сами. Ответы просто сделают оценку точнее."
      />
      <Box className="finance-layout">
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
      <FinanceLens data={data} revenue={data.monthlyRevenue || accountTurnover} />
      </Box>
      <FooterNav
        onBack={() => next(1)}
        onNext={onShowOffers}
        secondary={{ label: "Пропустить", onClick: () => void onShowOffers() }}
        next="Показать предложения"
        note="≈ 40 секунд"
      />
    </>
  );
}

// Справа — как банк увидит ответы: те же пороги, что у движка одобрения. Меняется вместе с полями.
function FinanceLens({ data, revenue }: { data: ApplicationData; revenue: number }) {
  const current = data.hasLoans === "Да" ? data.loanPayment : 0;
  const debt = share(current, revenue);
  const withNew = data.quote ? share(current + data.quote.monthly, revenue) : null;
  const rows: Array<{ label: string; value: string; note: string; tone: Tone; fill: number }> = [];
  if (debt != null) rows.push({
    label: "Долговая нагрузка",
    value: percent(debt),
    note: `${debtPoints(debt)} из ${DEBT_MAX_POINTS} баллов · до 5% — максимум`,
    tone: debtTone(debt),
    fill: Math.min(debt / 0.3, 1),
  });
  if (withNew != null && data.quote) rows.push({
    label: "С новым платежом",
    value: percent(withNew),
    note: `${formatMoney(current + data.quote.monthly)} в месяц · банк допускает до ${percent(PAYMENT_SHARE_LIMIT)} оборота`,
    tone: paymentTone(withNew),
    fill: Math.min(withNew / (PAYMENT_SHARE_LIMIT * 1.5), 1),
  });
  rows.push({
    label: "Кредитная история",
    value: data.hadOverdue2y ? "Были просрочки" : "Без просрочек",
    note: data.hadOverdue2y ? "Снижает оценку. Точно проверим в БКИ после подачи" : "До 15 баллов. Проверим в БКИ после подачи",
    tone: data.hadOverdue2y ? "amber" : "green",
    fill: data.hadOverdue2y ? 0.45 : 1,
  });
  return (
    <Paper className="finance-lens" aria-live="polite">
      <Typography className="finance-lens-eyebrow">КАК БАНК ВИДИТ ОТВЕТЫ</Typography>
      {rows.map((row) => (
        <Box key={row.label} className={`finance-lens-row tone-${row.tone}`}>
          <Box className="finance-lens-head"><span>{row.label}</span><b>{row.value}</b></Box>
          <Box className="finance-lens-bar"><i style={{ transform: `scaleX(${row.fill})` }} /></Box>
          <Typography className="finance-lens-note">{row.note}</Typography>
        </Box>
      ))}
      {revenue <= 0 && <Typography className="finance-lens-note">Укажите выручку — покажем нагрузку.</Typography>}
    </Paper>
  );
}
