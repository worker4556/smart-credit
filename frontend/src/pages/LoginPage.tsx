import { useState, type FormEvent } from "react";
import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";

interface LoginPageProps { onLogin: (login: string, password: string) => Promise<void>; notice?: string; }
export default function LoginPage({ onLogin, notice }: LoginPageProps) {
  const [login, setLogin] = useState("p1");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setLoading(true); setError(""); try { await onLogin(login.trim(), password); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось войти"); } finally { setLoading(false); } };
  return <Box className="login-page"><Paper component="form" className="login-card" onSubmit={submit}>
    <Box className="brand-mark">а</Box><Typography className="eyebrow">АЛЬФА-БИЗНЕС</Typography>
    <Typography variant="h3">Войдите в кабинет</Typography><Typography color="text.secondary">Введите логин и пароль</Typography>
    <TextField label="Логин" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required fullWidth autoFocus />
    <TextField label="Пароль" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth />
    <Typography variant="caption" color="text.secondary">Демо: p1–p5, zsk, specialist, admin. Пароль: demo.</Typography>
    {notice && <Alert severity="info">{notice}</Alert>}
    {error && <Alert severity="error">{error}</Alert>}
    <Button type="submit" variant="contained" size="large" disabled={loading}>{loading ? "Входим…" : "Войти"}</Button>
  </Paper></Box>;
}
