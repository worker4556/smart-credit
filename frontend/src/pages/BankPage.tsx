import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { api, type BankApplication, type BankDecision, type BankQueueItem, type BankReason } from "../api";
import { formatMoney as money } from "../utils/format";

const triggerLabel: Record<string, string> = {
  AMOUNT_ABOVE_2M: "Сумма больше 2 млн ₽",
  MISMATCH_UNRESOLVED: "Расхождение данных не снято",
  BORDERLINE_SCORE: "Пограничный балл",
  CLIENT_DISPUTE: "Клиент оспаривает данные",
};
const outcomeLabel: Record<BankDecision["outcome"], string> = {
  APPROVED: "Одобрить",
  COUNTER_OFFER: "Иные условия",
  INFO_REQUESTED: "Запросить данные",
  REJECTED: "Отказать",
};
// Один и тот же балл даёт разные лимиты по разным продуктам
const limitLabel: Record<string, string> = {
  WORKING_CAPITAL: "Оборотный кредит",
  OVERDRAFT: "Овердрафт",
};

// Кабинет кредитного специалиста: очередь исключений → досье → решение с кодом причины
export default function BankPage({ userName, onLogout }: { userName: string; onLogout: () => void }) {
  const [queue, setQueue] = useState<BankQueueItem[]>([]);
  const [reasons, setReasons] = useState<BankReason[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dossier, setDossier] = useState<BankApplication | null>(null);
  const [form, setForm] = useState<BankDecision>({ outcome: "COUNTER_OFFER", reasonCode: "", comment: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const loadQueue = useCallback(() => {
    api.bankQueue().then(setQueue).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    loadQueue();
    api.bankReasons().then((r) => setReasons(r.items.filter((item) => item.kind !== "NONCREDIT"))).catch(() => undefined);
    const timer = window.setInterval(loadQueue, 5000);
    return () => window.clearInterval(timer);
  }, [loadQueue]);

  useEffect(() => {
    if (!selected) { setDossier(null); return; }
    setError("");
    api.bankApplication(selected)
      .then((d) => {
        setDossier(d);
        // Рекомендация системы — стартовая точка решения специалиста
        const rec = d.recommendation.outcome as BankDecision["outcome"];
        setForm({
          outcome: rec in outcomeLabel ? rec : "COUNTER_OFFER",
          amount: d.recommendation.amount ?? d.decisionAmount ?? undefined,
          term: d.decisionTerm ?? undefined,
          reasonCode: "",
          comment: "",
        });
      })
      .catch((e: Error) => setError(e.message));
  }, [selected]);

  const needsAmount = form.outcome === "APPROVED" || form.outcome === "COUNTER_OFFER";

  const decide = async () => {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      await api.bankDecision(selected, {
        ...form,
        amount: needsAmount ? form.amount : undefined,
        term: needsAmount ? form.term : undefined,
      });
      setNotice(`Решение по заявке ${dossier?.number ?? ""} сохранено: ${outcomeLabel[form.outcome].toLowerCase()}`);
      setSelected(null);
      loadQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить решение");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box className="staff-page">
      <Box className="staff-head">
        <Box>
          <Typography className="eyebrow">АЛЬФА-БИЗНЕС · КАБИНЕТ СПЕЦИАЛИСТА</Typography>
          <Typography variant="h4" fontWeight={800}>Очередь на рассмотрение</Typography>
        </Box>
        <Box className="staff-user">
          <Typography>{userName}</Typography>
          <Button onClick={onLogout}>Выйти</Button>
        </Box>
      </Box>
      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert>}
      <Box className="staff-layout">
        <Paper className="staff-queue">
          <Typography fontWeight={800}>Заявки ({queue.length})</Typography>
          {queue.length === 0 && (
            <Typography color="text.secondary">
              Очередь пуста. Сюда попадают только исключения: автоконвейер решает остальное сам.
            </Typography>
          )}
          {queue.map((item) => (
            <Box
              key={item.applicationId}
              className={`staff-queue-item ${selected === item.applicationId ? "active" : ""}`}
              onClick={() => setSelected(item.applicationId)}
            >
              <Box className="staff-queue-top">
                <b>{item.number}</b>
                <span>{item.waitingMinutes} мин в очереди</span>
              </Box>
              <Typography>{item.companyName}</Typography>
              <Typography fontWeight={700}>{money(item.amount)}</Typography>
              <Box className="offer-badges">
                {item.triggers.map((t) => (
                  <Chip key={t} size="small" className="tone-chip tone-amber" label={triggerLabel[t] ?? t} />
                ))}
              </Box>
            </Box>
          ))}
        </Paper>

        <Paper className="staff-dossier">
          {!dossier && (
            <Typography color="text.secondary">Выберите заявку из очереди, чтобы открыть досье.</Typography>
          )}
          {dossier && (
            <>
              <Typography className="eyebrow">ДОСЬЕ · {dossier.number}</Typography>
              <Typography variant="h5" fontWeight={800}>
                Рекомендация системы: {outcomeLabel[dossier.recommendation.outcome as BankDecision["outcome"]] ?? dossier.recommendation.outcome}
                {dossier.recommendation.amount ? ` · ${money(dossier.recommendation.amount)}` : ""}
              </Typography>
              {dossier.decisionText && <Typography color="text.secondary">{dossier.decisionText}</Typography>}

              {dossier.stops.length > 0 && (
                <Box className="offer-badges" sx={{ mt: 1 }}>
                  {dossier.stops.map((s) => <Chip key={s} size="small" className="tone-chip tone-red" label={`Стоп: ${s}`} />)}
                </Box>
              )}

              <Divider sx={{ my: 2 }} />
              <Typography fontWeight={800}>
                Баллы: {dossier.factors.reduce((sum, f) => sum + f.points, 0)} из {dossier.factors.reduce((sum, f) => sum + f.maxPoints, 0)}
              </Typography>
              <Box className="staff-factors">
                {dossier.factors.map((f) => (
                  <Box key={f.label} className="staff-factor">
                    <span>{f.label}</span>
                    <LinearProgress
                      variant="determinate"
                      value={f.maxPoints ? (f.points / f.maxPoints) * 100 : 0}
                      className={f.points / Math.max(f.maxPoints, 1) < 0.5 ? "low" : ""}
                    />
                    <b>{f.points}/{f.maxPoints}</b>
                  </Box>
                ))}
              </Box>

              {Object.keys(dossier.limits).length > 0 && (
                <>
                  <Typography fontWeight={800} sx={{ mt: 2 }}>Лимиты по продуктам при этих баллах</Typography>
                  <Box className="staff-limits">
                    {Object.entries(dossier.limits).map(([key, value]) => (
                      <Box key={key}><span>{limitLabel[key] ?? key}</span><b>{money(value)}</b></Box>
                    ))}
                  </Box>
                </>
              )}

              {dossier.reasons.length > 0 && (
                <>
                  <Typography fontWeight={800} sx={{ mt: 2 }}>Причины</Typography>
                  {dossier.reasons.map((r) => <Typography key={r}>• {r}</Typography>)}
                </>
              )}

              <Divider sx={{ my: 2 }} />
              <Typography fontWeight={800}>Решение специалиста</Typography>
              <Box className="staff-form">
                <TextField
                  select
                  label="Исход"
                  value={form.outcome}
                  onChange={(e) => setForm({ ...form, outcome: e.target.value as BankDecision["outcome"] })}
                >
                  {Object.entries(outcomeLabel).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                </TextField>
                {needsAmount && (
                  <>
                    <TextField
                      type="number"
                      label="Сумма, ₽"
                      value={form.amount ?? ""}
                      onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || undefined })}
                    />
                    <TextField
                      type="number"
                      label="Срок, мес."
                      value={form.term ?? ""}
                      onChange={(e) => setForm({ ...form, term: Number(e.target.value) || undefined })}
                    />
                  </>
                )}
                <TextField
                  select
                  label="Код причины (обязательно)"
                  value={form.reasonCode}
                  onChange={(e) => setForm({ ...form, reasonCode: e.target.value })}
                  className="wide"
                >
                  {reasons.map((r) => <MenuItem key={r.code} value={r.code}>{r.code} · {r.text}</MenuItem>)}
                </TextField>
                <TextField
                  label="Комментарий"
                  value={form.comment}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                  className="wide"
                  multiline
                  minRows={2}
                />
              </Box>
              <Button variant="contained" disabled={!form.reasonCode || saving} onClick={() => void decide()}>
                {saving ? "Сохраняем…" : "Сохранить решение"}
              </Button>

              <Divider sx={{ my: 2 }} />
              <Typography fontWeight={800}>Журнал</Typography>
              {(dossier.events.length ? dossier.events : dossier.activity).map((e) => (
                <Typography key={`${e.at}-${e.text}`} variant="body2">
                  {new Date(e.at).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })} · {e.text}
                </Typography>
              ))}
            </>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
