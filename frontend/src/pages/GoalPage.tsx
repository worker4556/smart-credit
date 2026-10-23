import { useState } from "react";
import { Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Slider, TextField, Typography } from "@mui/material";
import AccountBalanceWallet from "@mui/icons-material/AccountBalanceWallet";
import CheckCircle from "@mui/icons-material/CheckCircle";
import HelpOutline from "@mui/icons-material/HelpOutline";
import ReceiptLong from "@mui/icons-material/ReceiptLong";
import Storefront from "@mui/icons-material/Storefront";
import Build from "@mui/icons-material/Build";
import Bolt from "@mui/icons-material/Bolt";
import { SelectCard, StepTitle } from "../components/ApplicationShell";
import { api, type IntentResponse } from "../api";
import { goals } from "../data/application";
import type { GoalPageProps } from "../types";
import { formatMoney } from "../utils/format";

const examples = [
  "Нужно 850 тысяч на 24 месяца на сезонную закупку зерна и сиропов",
  "Хочу 850 000 на два года, закупить товар к зиме",
];

export default function GoalPage({ data, update, next }: GoalPageProps) {
  const [description, setDescription] = useState(data.intentText ?? "");
  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    const text = description.trim();
    if (!text || loading) return;
    setLoading(true);
    setIntent(null);
    try {
      const result = await api.intent(text);
      setIntent(result);
      const goal = result.goal && goals.some(([label]) => label === result.goal) ? result.goal : null;
      if (goal) {
        update("goal", goal);
        if (goal.includes("кассов")) update("term", 12);
      }
      if (result.amount != null) update("amount", result.amount);
      if (result.term != null && !goal?.includes("кассов")) update("term", result.term);
    } catch {
      // If intent parsing is unavailable, keep the editable form usable.
    } finally {
      setLoading(false);
    }
  };

  const isOverdraft = data.goal.includes("кассов");
  const missing = intent?.missing ?? [];
  const fieldMissing = (field: string) => missing.includes(field);
  const iconFor = (icon: string) => {
    if (icon === "receipt") return <ReceiptLong />;
    if (icon === "store") return <Storefront />;
    if (icon === "help") return <HelpOutline />;
    if (icon === "bolt") return <Bolt />;
    if (icon === "tool") return <Build />;
    return <AccountBalanceWallet />;
  };

  return <>
    <StepTitle eyebrow="ШАГ 1 ИЗ 6 · ЗАДАЧА" title="Зачем деньги, сколько и на какой срок?" subtitle="Напишите как удобно — помощник разложит на поля. Или заполните форму справа: она всегда под рукой." />
    <Typography className="goal-prompt">Сначала расскажите, для чего бизнесу финансирование</Typography>
    <Box className="goal-intent-layout">
      <Box className="intent-panel">
        <Typography className="intent-label">Опишите своими словами</Typography>
        <TextField
          multiline minRows={4} maxRows={7} value={description}
          onChange={(event) => { setDescription(event.target.value); update("intentText", event.target.value); }}
          placeholder="Например: нужно 850 000 ₽ на 24 месяца на сезонную закупку товара"
          inputProps={{ "aria-label": "Опишите задачу финансирования" }}
        />
        <Button className="intent-submit" variant="contained" disabled={!description.trim() || loading} onClick={analyze}>
          {loading ? <><CircularProgress size={17} color="inherit" />&nbsp; Разбираем задачу…</> : "Разобрать"}
        </Button>
        <Typography className="intent-note">Решение принимает банк по своим правилам. Помощник только помогает заполнить заявку.</Typography>
        <Typography className="intent-examples-label">Фразы для примера</Typography>
        <Box className="intent-examples">{examples.map((example) => <Chip key={example} label={example} onClick={() => { setDescription(example); update("intentText", example); }} />)}</Box>
        {intent && <Card className="intent-result">
          <CardContent>
            <Typography fontWeight={800}>Проверьте, правильно ли мы поняли</Typography>
            <Box className="intent-result-fields">
              <span>{intent.goal ? <CheckCircle /> : <HelpOutline />} Цель: {intent.goal ?? "не распознана"}</span>
              <span>{intent.amount != null ? <CheckCircle /> : <HelpOutline />} Сумма: {intent.amount != null ? formatMoney(intent.amount) : "не указана"}</span>
              <span>{intent.term != null ? <CheckCircle /> : <HelpOutline />} Срок: {intent.term != null ? `${intent.term} мес.` : "не указан"}</span>
            </Box>
            {intent.productReason && <Typography className="intent-reason">{intent.productReason}</Typography>}
          </CardContent>
        </Card>}
      </Box>

      <Box className="goal-form-panel">
        <Typography className="form-section-label">Цель</Typography>
        <Box className="goal-grid">
          {goals.map(([label, subtitle, icon]) => <SelectCard
            key={label} selected={data.goal === label}
            className={fieldMissing("goal") ? "intent-missing" : ""}
            onClick={() => { update("goal", label); if (label.includes("кассов")) update("term", 12); }}
            icon={iconFor(icon)} title={label} subtitle={subtitle}
          />)}
        </Box>
        <Divider />
        <Box className={`goal-control ${fieldMissing("amount") ? "intent-field-missing" : ""}`}>
          <Box className="goal-control-heading"><Typography fontWeight={800}>Сумма</Typography><Typography fontWeight={800}>{formatMoney(data.amount)}</Typography></Box>
          <Slider min={50_000} max={5_000_000} step={50_000} value={data.amount} onChange={(_, value) => update("amount", Number(value))} aria-label="Сумма финансирования" />
          <Box className="slider-ends"><span>50 тыс.</span><span>5 млн</span></Box>
        </Box>
        {!isOverdraft ? <Box className={`goal-control ${fieldMissing("term") ? "intent-field-missing" : ""}`}>
          <Box className="goal-control-heading"><Typography fontWeight={800}>Срок</Typography><Typography className="term-badge">{data.term} мес.</Typography></Box>
          <Typography className="term-hint">Чем дольше срок, тем меньше платёж</Typography>
          <Slider min={3} max={36} step={1} value={data.term} onChange={(_, value) => update("term", Number(value))} aria-label="Срок в месяцах" />
          <Box className="slider-ends"><span>3 мес.</span><span>36 мес.</span></Box>
        </Box> : <Typography className="overdraft-term-note">Для овердрафта срок составляет 12 месяцев.</Typography>}
        <Box className="goal-product-note"><AccountBalanceWallet /><span>Продукт: <b>{isOverdraft ? "Овердрафт" : "Оборотный кредит"}</b></span></Box>
        <Box className="goal-actions"><Button variant="text" onClick={() => { setDescription(""); update("intentText", ""); setIntent(null); }}>Отмена</Button><Button variant="contained" onClick={() => next(1)}>Подтвердить и продолжить <span aria-hidden>→</span></Button></Box>
      </Box>
    </Box>
  </>;
}
