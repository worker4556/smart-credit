import { useState, type FormEvent } from "react";
import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";

interface LoginPageProps { onLogin: (password: string) => Promise<void>; }
export default function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setLoading(true); setError(""); try { await onLogin(password); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось войти"); } finally { setLoading(false); } };
  return <Box className="login-page"><Paper component="form" className="login-card" onSubmit={submit}>
    <Box className="brand-mark">а</Box><Typography className="eyebrow">АЛЬФА-БИЗНЕС</Typography>
    <Typography variant="h3">Войдите в кабинет</Typography><Typography color="text.secondary">Введите пароль</Typography>
    <TextField label="Пароль" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth autoFocus />
    <Typography variant="caption" color="text.secondary">P1: 111111 · P2: 222222 · P3: 333333 · P4: 444444 · P5: 555555 · ZSK: 777777 · P6: 666666</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    <Button type="submit" variant="contained" size="large" disabled={loading}>{loading ? "Входим…" : "Войти"}</Button>
  </Paper></Box>;
}
