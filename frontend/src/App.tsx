import React, { useCallback, useEffect, useState } from "react";
import { Alert, Box, CssBaseline, Paper, ThemeProvider, Typography } from "@mui/material";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import theme from "./theme";
import { defaultData } from "./data/application";
import { Header, StepRail } from "./components/ApplicationShell";
import GoalPage from "./pages/GoalPage";
import AmountPage from "./pages/AmountPage";
import CompanyPage from "./pages/CompanyPage";
import FinancePage from "./pages/FinancePage";
import OffersPage from "./pages/OffersPage";
import DocumentsPage from "./pages/DocumentsPage";
import ReviewPage from "./pages/ReviewPage";
import StatusPage from "./pages/StatusPage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import { api, ApiError, clearToken, getToken, saveToken, type ApplicationResponse, type UserProfile } from "./api";
import type { ApplicationData, Outcome } from "./types";
import "./styles.css";

export default function App() {
  const [token, setToken] = useState(getToken());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [data, setData] = useState<ApplicationData>(defaultData);
  const [screen, setScreen] = useState(0);
  const [page, setPage] = useState<"application" | "profile" | "bank" | "admin">("application");
  const [selectedOffer, setSelectedOffer] = useState(0);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [amountError, setAmountError] = useState("");

  const applyApplication = useCallback((response: ApplicationResponse) => {
    const responseOutcome = (response as ApplicationResponse & { status?: string }).status === "INFO" ? "info"
      : (response as ApplicationResponse & { status?: string }).status === "SUSPENDED_115FZ" ? "suspended" : response.outcome;
    setData((current) => ({ ...current, ...response, applicationId: response.applicationId ?? response.id ?? current.applicationId,
      outcome: responseOutcome,
      decisionText: response.decisionText ?? response.decision?.decisionText ?? current.decisionText,
      decisionAmount: response.decisionAmount ?? response.decision?.decisionAmount ?? current.decisionAmount,
      decisionRate: response.decisionRate ?? response.decision?.decisionRate ?? current.decisionRate,
      decisionMonthly: response.decisionMonthly ?? response.decision?.decisionMonthly ?? current.decisionMonthly,
      reasons: response.reasons ?? response.decision?.reasons ?? current.reasons,
      decision: response.decision ?? (response.decisionText || response.decisionAmount != null ? { decisionText: response.decisionText, decisionAmount: response.decisionAmount, decisionRate: response.decisionRate, decisionMonthly: response.decisionMonthly, reasons: response.reasons } : current.decision),
      submitted: response.submitted ?? responseOutcome !== "review", activity: response.activity ?? current.activity }));
  }, []);

  const handleLogin = async (login: string, password: string) => {
    const result = await api.login(login, password);
    const accessToken = result.accessToken ?? result.access_token ?? result.token;
    if (!accessToken) throw new Error("Сервер не вернул токен авторизации");
    saveToken(accessToken); setToken(accessToken);
    if (result.role === "SPECIALIST") { window.history.pushState({}, "", "/bank"); setPage("bank"); return; }
    if (result.role === "ADMIN") { window.history.pushState({}, "", "/admin"); setPage("admin"); return; }
    const me = result.user ?? await api.me(); setProfile(me);
    if (me.role === "SPECIALIST") { window.history.pushState({}, "", "/bank"); setPage("bank"); }
    else if (me.role === "ADMIN") { window.history.pushState({}, "", "/admin"); setPage("admin"); }
    else { window.history.pushState({}, "", "/"); setPage("application"); setScreen(0); }
  };

  const logout = () => { clearToken(); setToken(null); setProfile(null); setData(defaultData); setPage("application"); window.history.replaceState({}, "", "/"); };

  useEffect(() => {
    if (!token) return;
    const route = window.location.pathname;
    if (route === "/bank") { setPage("bank"); return; }
    if (route === "/admin") { setPage("admin"); return; }
    let active = true;
    void api.me().then(async (me) => {
      if (!active) return;
      setProfile(me);
      setData((current) => ({ ...current, inn: me.inn ?? "", company: me.company, monthlyRevenue: me.company?.account?.average_monthly_turnover ?? current.monthlyRevenue }));
      if (me.role === "SPECIALIST") { window.history.replaceState({}, "", "/bank"); setPage("bank"); return; }
      if (me.role === "ADMIN") { window.history.replaceState({}, "", "/admin"); setPage("admin"); return; }
      try {
        const created = await api.createApplication({ ...defaultData, inn: me.inn ?? "", company: me.company, applicationId: undefined });
        if (active) { applyApplication(created); }
      } catch (error) { if (active) setApiError(toMessage(error, "Не удалось открыть заявку")); }
    }).catch((error) => { if (active) { if (error instanceof ApiError && error.status === 401) logout(); else setApiError(toMessage(error, "Не удалось загрузить личный кабинет")); } });
    return () => { active = false; };
  // Load the profile and create a backend draft once per authenticated session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const update = <K extends keyof ApplicationData>(key: K, value: ApplicationData[K]) => {
    setData((current) => ({ ...current, [key]: value, ...(key === "amount" || key === "term" || key === "goal" ? { quote: undefined } : {}) }));
    if (key === "amount") setAmountError("");
  };

  useEffect(() => {
    if (screen !== 1 || !data.applicationId) return;
    const term = data.goal.includes("кассов") ? 12 : data.term;
    const timer = window.setTimeout(() => void api.quote(data.goal, data.amount, term).then((quote) => { setData((current) => ({ ...current, quote })); setAmountError(""); }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 400) setAmountError(error.message); else setApiError(toMessage(error, "Не удалось получить предварительный расчёт"));
    }), 300);
    return () => window.clearTimeout(timer);
  }, [screen, data.applicationId, data.goal, data.amount, data.term]);

  useEffect(() => {
    if (screen !== 7 || !data.applicationId || !data.submitted || data.outcome !== "review") return;
    const timer = window.setInterval(() => void api.application(data.applicationId!).then(async (record) => {
      applyApplication(record);
      if (["rejected", "partial"].includes(record.outcome) && !record.route) {
        const route = await api.route(data.applicationId!); setData((current) => ({ ...current, route }));
      }
    }).catch((error) => setApiError(toMessage(error, "Не удалось обновить статус заявки"))), 3000);
    return () => window.clearInterval(timer);
  }, [screen, data.applicationId, data.submitted, data.outcome, applyApplication]);

  const next = async (index = screen + 1) => {
    if (data.applicationId && index !== 7) {
      try { await api.updateApplication(data.applicationId, data); }
      catch (error) { setApiError(toMessage(error, "Не удалось сохранить заявку")); return; }
    }
    setScreen(index); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showOffers = async () => {
    const id = data.applicationId; if (!id) return;
    setLoading(true); setApiError("");
    try {
      await api.updateApplication(id, data);
      const result = await api.precheck(id);
      setData((current) => ({ ...current, precheck: result, goalOffers: result.goalOffers })); setSelectedOffer(0); setScreen(4);
    } catch (error) { setApiError(toMessage(error, "Не удалось получить предложения")); }
    finally { setLoading(false); }
  };

  const submit = async () => {
    if (!data.applicationId) return;
    setLoading(true); setApiError("");
    try { applyApplication(await api.submit(data.applicationId, data)); setData((current) => ({ ...current, submitted: true, outcome: "review" })); setScreen(7); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (error) { setApiError(toMessage(error, "Не удалось отправить заявку")); }
    finally { setLoading(false); }
  };

  const lookupCompany = async (inn: string) => {
    try { const company = await api.company(inn); setData((current) => ({ ...current, company, inn, companyOk: false, monthlyRevenue: company.account?.average_monthly_turnover ?? current.monthlyRevenue })); return company; }
    catch (error) { if (error instanceof ApiError && error.status === 404) throw new Error("Компания не найдена среди ваших"); throw error; }
  };
  const addDocument = async (file: File) => { if (!data.applicationId) return; applyApplication(await api.uploadDocument(data.applicationId, file)); };
  const accept = async () => { if (!data.applicationId) return; await api.accept(data.applicationId); applyApplication(await api.application(data.applicationId)); };
  const recalcRoute = async (done: string[]) => { if (!data.applicationId) return; const route = await api.recalculateRoute(data.applicationId, done); setData((current) => ({ ...current, route })); };

  useEffect(() => {
    const onPopState = () => { const path = window.location.pathname; setPage(path === "/profile" ? "profile" : path === "/bank" ? "bank" : path === "/admin" ? "admin" : "application"); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openProfile = () => { window.history.pushState({}, "", "/profile"); setPage("profile"); };

  if (!token) return <ThemeProvider theme={theme}><CssBaseline /><LoginPage onLogin={handleLogin} /></ThemeProvider>;
  if (page === "profile" && profile) return <ThemeProvider theme={theme}><CssBaseline /><ProfilePage profile={profile} onBack={() => { window.history.pushState({}, "", "/"); setPage("application"); }} onLogout={logout} /></ThemeProvider>;
  if (page === "bank" || page === "admin") return <ThemeProvider theme={theme}><CssBaseline /><Box className="role-placeholder"><Paper><Typography className="eyebrow">АЛЬФА-БИЗНЕС</Typography><Typography variant="h3">{page === "bank" ? "Кабинет специалиста" : "Панель администратора"}</Typography><Typography color="text.secondary">Этот раздел будет подключён на следующем этапе.</Typography><Typography className="role-name">{profile?.name}</Typography><button onClick={logout}>Выйти</button></Paper></Box></ThemeProvider>;

  const monthly = data.quote?.monthly ?? 0;
  const total = data.quote?.total ?? 0;
  const offers = data.goalOffers ?? data.precheck?.goalOffers ?? [];
  const chosen = offers[selectedOffer];
  const pages = [
    <GoalPage key="goal" data={data} update={update} next={next} />,
    <AmountPage key="amount" data={data} update={update} next={next} monthly={monthly} total={total} amountError={amountError} />,
    <CompanyPage key="company" data={data} update={update} next={next} lookupCompany={lookupCompany} profileCompany={profile?.company} setToast={setToast} />,
    <FinancePage key="finance" data={data} update={update} next={next} company={data.company} setSelectedOffer={setSelectedOffer} onShowOffers={showOffers} />,
    <OffersPage key="offers" data={data} update={update} next={next} goalOffers={offers} selectedOffer={selectedOffer} setSelectedOffer={setSelectedOffer} monthly={monthly} chosen={chosen} setToast={setToast} />,
    <DocumentsPage key="documents" data={data} update={update} next={next} uploadFile={addDocument} />,
    <ReviewPage key="review" data={data} update={update} next={next} monthly={monthly} submit={submit} loading={loading} />,
    <StatusPage key="status" data={data} update={update} setData={setData} setScreen={setScreen} next={next} monthly={monthly} total={total} uploadDocument={addDocument} acceptOffer={accept} recalculateRoute={recalcRoute} />,
  ];
  return <ThemeProvider theme={theme}><CssBaseline /><Header screen={screen} setScreen={setScreen} userName={profile?.name} openProfile={openProfile} />
    <Box className="app-shell"><StepRail screen={screen} setScreen={setScreen} /><Box component="main" className="main-content">
      {apiError && <Alert severity="error" onClose={() => setApiError("")} sx={{ mb: 2 }}>{apiError}</Alert>}{pages[screen]}
    </Box></Box>{toast && <Box className="toast-msg" onClick={() => setToast("")}>{toast}</Box>}
    <Box className="bottom-help"><ShieldOutlined /> Безопасно. Просто. На ваших условиях. <span>© Альфа-Бизнес · Кредитный кабинет</span></Box>
  </ThemeProvider>;
}

function toMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
