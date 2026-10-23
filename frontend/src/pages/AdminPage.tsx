import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { api, type AdminApplication, type AdminStats, type AdminSystem } from "../api";
import { formatMoney as money } from "../utils/format";

const statusTone: Record<string, string> = {
  approved: "tone-green",
  partial: "tone-amber",
  info: "tone-amber",
  specialist: "tone-amber",
  review: "tone-amber",
  rejected: "tone-red",
  suspended: "tone-red",
};

// Админка ведущего демо: состояние сервисов, все заявки, сброс демо-данных
export default function AdminPage({ userName, onLogout }: { userName: string; onLogout: () => void }) {
  const [system, setSystem] = useState<AdminSystem | null>(null);
  const [rows, setRows] = useState<AdminApplication[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    api.adminSystem().then(setSystem).catch((e: Error) => setError(e.message));
    api.adminApplications().then(setRows).catch((e: Error) => setError(e.message));
    api.adminStats().then(setStats).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const reset = async () => {
    if (!window.confirm("Удалить все заявки и начать демо заново? Учётные записи останутся.")) return;
    try {
      await api.adminReset();
      setNotice("Демо-данные сброшены");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сбросить данные");
    }
  };

  const ok = (value?: string | boolean) => (value === "ok" || value === true ? "tone-green" : "tone-red");

  return (
    <Box className="staff-page">
      <Box className="staff-head">
        <Box>
          <Typography className="eyebrow">АЛЬФА-БИЗНЕС · АДМИНИСТРИРОВАНИЕ</Typography>
          <Typography variant="h4" fontWeight={800}>Состояние демо</Typography>
        </Box>
        <Box className="staff-user">
          <Typography>{userName}</Typography>
          <Button onClick={onLogout}>Выйти</Button>
        </Box>
      </Box>
      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert>}

      <Paper className="staff-dossier">
        <Typography fontWeight={800}>Сервисы</Typography>
        <Box className="offer-badges" sx={{ mt: 1 }}>
          <Chip className={`tone-chip ${ok(system?.backend)}`} label={`backend: ${system?.backend ?? "…"}`} />
          <Chip className={`tone-chip ${ok(system?.ml)}`} label={`ml: ${system?.ml ?? "…"}`} />
          <Chip
            className={`tone-chip ${ok(system?.llm.ready)}`}
            label={`LLM: ${system ? (system.llm.enabled ? (system.llm.ready ? `готова · ${system.llm.model ?? ""}` : "загружается") : "выключена — тексты по шаблонам") : "…"}`}
          />
          {system?.policyVersion && <Chip variant="outlined" label={`политика ${system.policyVersion}`} />}
        </Box>
      </Paper>

      {stats && <ProductStats stats={stats} />}

      <Paper className="staff-dossier">
        <Box className="staff-head">
          <Typography fontWeight={800}>Все заявки ({rows.length})</Typography>
          <Button color="error" variant="outlined" onClick={() => void reset()}>Сбросить демо-данные</Button>
        </Box>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Номер</TableCell>
              <TableCell>Компания</TableCell>
              <TableCell align="right">Сумма</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Последнее действие</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.applicationId}>
                <TableCell>{row.number}</TableCell>
                <TableCell>{row.companyName}</TableCell>
                <TableCell align="right">{money(row.amount)}</TableCell>
                <TableCell><Chip size="small" className={`tone-chip ${statusTone[row.outcome] ?? ""}`} label={row.status} /></TableCell>
                <TableCell>{row.decidedBy ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}

// ---------- Эффект продукта для банка: только по событиям заявок (docs/route-pages.md, раздел 8) ----------

const OUTCOME_LABEL: Record<string, string> = {
  APPROVED: "Одобрено", COUNTER_OFFER: "Иные условия", INFO_REQUESTED: "Нужны данные", REJECTED: "Отказ", SUSPENDED_115FZ: "115-ФЗ",
};
const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
const minutes = (v: number | null) => (v == null ? "—" : v < 1 ? "< 1 мин" : `${v} мин`);

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return <Box className="stat-tile"><Typography className="eyebrow">{label}</Typography><Typography className="stat-value">{value}</Typography><Typography className="stat-note">{note}</Typography></Box>;
}

function ProductStats({ stats }: { stats: AdminStats }) {
  const f = stats.funnel;
  const maxOutcome = Math.max(1, ...Object.values(stats.outcomes));
  return <Paper className="staff-dossier">
    <Typography fontWeight={800}>Эффект продукта</Typography>
    <Typography variant="body2" color="text.secondary">Считается по событиям всех заявок в базе. Данные демо-стенда — синтетические заявки.</Typography>
    <Box className="stat-tiles">
      <Tile label="ВОРОНКА" value={`${f.drafts} → ${f.submitted} → ${f.decided} → ${f.issued}`} note="черновики → поданы → решение → выдано" />
      <Tile label="АВТОМАТИЧЕСКИЕ РЕШЕНИЯ" value={pct(stats.autoDecisionShare)} note="без участия специалиста" />
      <Tile label="ЗАПОЛНЕНИЕ ЗАЯВКИ" value={minutes(stats.fillMinutesMedian)} note="медиана от черновика до подачи" />
      <Tile label="ДО РЕШЕНИЯ" value={minutes(stats.decisionMinutesMedian)} note="медиана от подачи до решения" />
      <Tile label="ВОЗВРАТ ПОСЛЕ ОТКАЗА" value={pct(stats.returnedAfterRefusalShare)} note={`маршрут готов или новая заявка · отказов: ${stats.refused}`} />
      <Tile label="ПРЕДОЦЕНКА ↔ РЕШЕНИЕ" value={pct(stats.precheckMatchShare)} note={`исход совпал · сравнено заявок: ${stats.precheckCompared}`} />
    </Box>
    <Box className="stat-columns">
      <Box>
        <Typography fontWeight={700}>Исходы решений</Typography>
        {Object.entries(stats.outcomes).map(([key, count]) => <Box key={key} className="stat-bar" title={`${OUTCOME_LABEL[key] ?? key}: ${count}`}>
          <span>{OUTCOME_LABEL[key] ?? key}</span>
          <i><b style={{ width: `${(count / maxOutcome) * 100}%` }} /></i>
          <em>{count}</em>
        </Box>)}
      </Box>
      <Box>
        <Typography fontWeight={700}>Частые причины отказа и ограничений</Typography>
        {stats.topReasons.length
          ? stats.topReasons.map((r) => <Box key={r.text} className="stat-reason"><span>{r.text}</span><em>{r.count}</em></Box>)
          : <Typography variant="body2" color="text.secondary">Пока нет решений с причинами.</Typography>}
      </Box>
    </Box>
  </Paper>;
}
