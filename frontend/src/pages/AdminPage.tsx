import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { api, type AdminApplication, type AdminSystem } from "../api";
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    api.adminSystem().then(setSystem).catch((e: Error) => setError(e.message));
    api.adminApplications().then(setRows).catch((e: Error) => setError(e.message));
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
