import React, { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, CssBaseline, Paper, ThemeProvider, Typography } from "@mui/material";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import theme from "./theme";
import { defaultData, goals } from "./data/application";
import { DEFAULT_DEMO_ACCOUNT, demoAccounts, type DemoAccount } from "./data/demoAccounts";
import { Header, StepRail } from "./components/ApplicationShell";
import GoalPage from "./pages/GoalPage";
import AmountPage from "./pages/AmountPage";
import CompanyPage from "./pages/CompanyPage";
import FinancePage from "./pages/FinancePage";
import OffersPage from "./pages/OffersPage";
import DocumentsPage from "./pages/DocumentsPage";
import ReviewPage from "./pages/ReviewPage";
import StatusPage from "./pages/StatusPage";
import ProfilePage from "./pages/ProfilePage";
import LoginPage from "./pages/LoginPage";
import HelpPage from "./pages/HelpPage";
import { api, ApiError, clearToken, getToken, saveToken, type ApplicationResponse, type UserProfile } from "./api";
import type { ApplicationData, Company, Role } from "./types";
import "./styles.css";

const PROFILE_SESSION_KEY = "credit-user-profile";
const roleLabels: Record<Role, string> = { CLIENT: "Клиент", SPECIALIST: "Специалист", ADMIN: "Администратор" };

function demoAccountForLogin(login?: string): DemoAccount {
  return demoAccounts.find((account) => account.id.toLowerCase() === login?.toLowerCase()) ?? DEFAULT_DEMO_ACCOUNT;
}

function applicationForAccount(account: DemoAccount, profile?: UserProfile): ApplicationData {
  const company = profile?.company ?? account.company;
  return {
    ...defaultData,
    goal: account.goal,
    amount: account.amount,
    term: account.term,
    inn: company.inn,
    company,
    companyOk: false,
    monthlyRevenue: account.monthlyRevenue,
    hasLoans: account.hasLoans,
    loanPayment: account.loanPayment,
    hadOverdue2y: account.hadOverdue2y,
  };
}

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [data, setData] = useState<ApplicationData>(() => applicationForAccount(DEFAULT_DEMO_ACCOUNT));
  const [screen, setScreen] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getToken()));
  const [checkingSession, setCheckingSession] = useState(() => Boolean(getToken()));
  const [page, setPage] = useState<"application" | "profile" | "help" | "bank" | "admin">(() => {
    const path = window.location.pathname;
    return path === "/profile" ? "profile" : path === "/help" ? "help" : path === "/bank" ? "bank" : path === "/admin" ? "admin" : "application";
  });
  const [selectedOffer, setSelectedOffer] = useState(0);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [authNotice, setAuthNotice] = useState("");

  useEffect(() => {
    const onUnauthorized = () => {
      setIsAuthenticated(false);
      setProfile(null);
      setScreen(0);
      setData(applicationForAccount(DEFAULT_DEMO_ACCOUNT));
      setAuthNotice("Сессия истекла. Войдите снова.");
      sessionStorage.removeItem(PROFILE_SESSION_KEY);
    };
    window.addEventListener("api:unauthorized", onUnauthorized);
    return () => window.removeEventListener("api:unauthorized", onUnauthorized);
  }, []);

  useEffect(() => {
    if (!getToken()) { setCheckingSession(false); return; }
    void api.me().then((user) => {
      setProfile(user);
      sessionStorage.setItem(PROFILE_SESSION_KEY, JSON.stringify(user));
      setData(applicationForAccount(demoAccountForLogin(user.login), user));
      setScreen(0);
      setApiError("");
      setAuthNotice("");
      setPage(user.role === "CLIENT" && window.location.pathname === "/profile" ? "profile" : "application");
    }).catch((error) => {
      setAuthNotice(
        error instanceof ApiError && error.status === 401
          ? "Сессия истекла. Войдите снова."
          : toMessage(error, "Не удалось проверить сессию."),
      );
    }).finally(() => setCheckingSession(false));
  }, []);

  const applyApplication = useCallback((response: ApplicationResponse) => {
    const backendStatus = (response as ApplicationResponse & { status?: string }).status;
    const outcome = backendStatus === "INFO" ? "info" : backendStatus === "SUSPENDED_115FZ" ? "suspended" : response.outcome;
    setData((current) => ({
      ...current,
      ...response,
      applicationId: response.applicationId ?? response.id ?? current.applicationId,
      outcome,
      decisionText: response.decisionText ?? response.decision?.decisionText ?? current.decisionText,
      decisionAmount: response.decisionAmount ?? response.decision?.decisionAmount ?? current.decisionAmount,
      decisionRate: response.decisionRate ?? response.decision?.decisionRate ?? current.decisionRate,
      decisionMonthly: response.decisionMonthly ?? response.decision?.decisionMonthly ?? current.decisionMonthly,
      reasons: response.reasons ?? response.decision?.reasons ?? current.reasons,
      submitted: response.submitted ?? outcome !== "review",
      activity: response.activity ?? current.activity,
    }));
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !profile || profile.role !== "CLIENT") return;
    let active = true;
    const draft = applicationForAccount(demoAccountForLogin(profile.login), profile);
    setData(draft);
    void api.createApplication(draft)
      .then((response) => { if (active) applyApplication(response); })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 404)) return;
        setApiError(toMessage(error, "Не удалось создать черновик"));
      });
    return () => { active = false; };
  }, [profile, isAuthenticated, applyApplication]);

  const loginWithPassword = async (login: string, password: string) => {
    const response = await api.login(login, password);
    saveToken(response.accessToken);
    const user = response.user;
    sessionStorage.setItem(PROFILE_SESSION_KEY, JSON.stringify(user));
    setProfile(user);
    setData(applicationForAccount(demoAccountForLogin(user.login), user));
    setScreen(0);
    const destination = user.role === "SPECIALIST" ? "/bank" : user.role === "ADMIN" ? "/admin" : "/";
    setPage(user.role === "SPECIALIST" ? "bank" : user.role === "ADMIN" ? "admin" : "application");
    setApiError("");
    setAuthNotice("");
    setIsAuthenticated(true);
    window.history.pushState({}, "", destination);
  };

  const logout = () => {
    clearToken();
    sessionStorage.removeItem(PROFILE_SESSION_KEY);
    setProfile(null);
    setIsAuthenticated(false);
    setScreen(0);
    setData(applicationForAccount(DEFAULT_DEMO_ACCOUNT));
    setPage("application");
    setAuthNotice("");
    window.history.pushState({}, "", "/");
  };

  const update = <K extends keyof ApplicationData>(key: K, value: ApplicationData[K]) => {
    setData((current) => ({ ...current, [key]: value, ...(key === "amount" || key === "term" || key === "goal" ? { quote: undefined } : {}) }));
    if (key === "amount") setAmountError("");
  };

  useEffect(() => {
    if (screen !== 2 || !data.applicationId) return;
    const term = data.goal.includes("кассов") ? 12 : data.term;
    const timer = window.setTimeout(() => void api.quote(data.goal, data.amount, term)
      .then((quote) => { setData((current) => ({ ...current, quote })); setAmountError(""); })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 400) setAmountError(error.message);
        else setApiError(toMessage(error, "Не удалось получить предварительный расчёт"));
      }), 300);
    return () => window.clearTimeout(timer);
  }, [screen, data.applicationId, data.goal, data.amount, data.term]);

  useEffect(() => {
    // Пока решение не принято (автоконвейер или специалист) — опрашиваем статус
    if (screen !== 7 || !data.applicationId || !data.submitted || !(["review", "specialist"].includes(data.outcome) || data.status === "SIGNED")) return;
    const timer = window.setInterval(() => void api.application(data.applicationId!)
      .then(async (record) => {
        applyApplication(record);
        if (["rejected", "partial"].includes(record.outcome) && !record.route) {
          const route = await api.route(data.applicationId!);
          setData((current) => ({ ...current, route }));
        }
      })
      .catch((error) => setApiError(toMessage(error, "Не удалось обновить статус заявки"))), 3000);
    return () => window.clearInterval(timer);
  }, [screen, data.applicationId, data.submitted, data.outcome, data.status, applyApplication]);

  const next = async (index = screen + 1) => {
    if (data.applicationId && index !== 7) {
      try { await api.updateApplication(data.applicationId, data); }
      catch (error) { setApiError(toMessage(error, "Не удалось сохранить заявку")); return; }
    }
    setScreen(index);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const navigateToStep = async (index: number) => {
    if (index === screen) return;
    if (index > 0 && data.applicationId) {
      try { await api.updateApplication(data.applicationId, data); }
      catch (error) { setApiError(toMessage(error, "Не удалось сохранить заявку")); return; }
    }
    setApiError("");
    setScreen(index);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showOffers = async () => {
    if (!data.applicationId) return;
    setLoading(true); setApiError("");
    try {
      await api.updateApplication(data.applicationId, data);
      const result = await api.precheck(data.applicationId);
      setData((current) => ({ ...current, precheck: result, goalOffers: result.goalOffers }));
      setSelectedOffer(0); setScreen(4);
    } catch (error) { setApiError(toMessage(error, "Не удалось получить предложения")); }
    finally { setLoading(false); }
  };

  // Выбранный вариант становится условиями заявки: сумма, срок и продукт
  const chooseOffer = async () => {
    const offer = (data.goalOffers ?? data.precheck?.goalOffers ?? [])[selectedOffer];
    let updated = data;
    if (offer && typeof offer.amount === "number") {
      const cashGap = goals[2][0];
      const goal = offer.product === "OVERDRAFT" ? cashGap : data.goal === cashGap ? goals[0][0] : data.goal;
      updated = {
        ...data,
        goal,
        amount: offer.amount,
        term: offer.termMonths ?? data.term,
        quote: offer.monthly != null ? { monthly: offer.monthly, total: offer.amount + (offer.fullCost ?? 0), rate: offer.rate } : data.quote,
      };
      setData(updated);
    }
    if (updated.applicationId) {
      try { await api.updateApplication(updated.applicationId, updated); }
      catch (error) { setApiError(toMessage(error, "Не удалось сохранить заявку")); return; }
    }
    setScreen(5);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (!data.applicationId) return;
    setLoading(true); setApiError("");
    try {
      const response = await api.submit(data.applicationId, data);
      applyApplication(response);
      setData((current) => ({ ...current, submitted: true, outcome: "review" }));
      setScreen(7); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) { setApiError(toMessage(error, "Не удалось отправить заявку")); }
    finally { setLoading(false); }
  };

  const lookupCompany = async (inn: string): Promise<Company> => {
    try {
      const company = await api.company(inn);
      setData((current) => ({ ...current, company, inn, companyOk: false, monthlyRevenue: company.averageMonthlyTurnover ?? current.monthlyRevenue }));
      return company;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw new Error("Компания не найдена среди ваших");
      throw error;
    }
  };

  const addDocument = async (file: File) => {
    if (!data.applicationId) return;
    applyApplication(await api.uploadDocument(data.applicationId, file));
  };
  const accept = async () => {
    if (!data.applicationId) return;
    await api.accept(data.applicationId);
    applyApplication(await api.application(data.applicationId));
  };
  const sign = async () => {
    if (!data.applicationId) return;
    try {
      await api.sign(data.applicationId);
      applyApplication(await api.application(data.applicationId));
    } catch (error) { setApiError(toMessage(error, "Не удалось подписать договор")); }
  };
  const recalcRoute = async (done: string[]) => {
    if (!data.applicationId) return;
    const route = await api.recalculateRoute(data.applicationId, done);
    // ML возвращает только оставшиеся шаги — выполненные оставляем в списке отмеченными
    const doneSet = new Set(done);
    const remaining = new Set(route.steps.map((step) => step.code));
    const kept = (data.route?.steps ?? [])
      .filter((step) => doneSet.has(step.code) && !remaining.has(step.code))
      .map((step) => ({ ...step, done: true }));
    setData((current) => ({ ...current, route: { ...route, steps: [...kept, ...route.steps] } }));
  };

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      setPage(path === "/profile" ? "profile" : path === "/help" ? "help" : path === "/bank" ? "bank" : path === "/admin" ? "admin" : "application");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openProfile = () => { window.history.pushState({}, "", "/profile"); setPage("profile"); };
  const backFromProfile = () => { window.history.pushState({}, "", "/"); setPage("application"); };
  const openHelp = () => { window.history.pushState({}, "", "/help"); setPage("help"); };
  const backFromHelp = () => { window.history.pushState({}, "", "/"); setPage("application"); };
  const openApplication = (targetScreen: number) => {
    if (window.location.pathname !== "/") window.history.pushState({}, "", "/");
    setPage("application");
    if (targetScreen === screen) return;
    void navigateToStep(targetScreen);
  };

  if (checkingSession) return <ThemeProvider theme={theme}><CssBaseline /><Box className="login-page"><Typography>Проверяем учётную запись…</Typography></Box></ThemeProvider>;
  if (!isAuthenticated || !profile) return <ThemeProvider theme={theme}><CssBaseline /><LoginPage onLogin={loginWithPassword} notice={authNotice} /></ThemeProvider>;
  if (profile.role !== "CLIENT") return <ThemeProvider theme={theme}><CssBaseline /><RolePlaceholder profile={profile} onLogout={logout} /></ThemeProvider>;
  if (page === "profile") return <ThemeProvider theme={theme}><CssBaseline /><ProfilePage profile={profile} onBack={backFromProfile} /></ThemeProvider>;
  if (page === "help") return <ThemeProvider theme={theme}><CssBaseline />
    <Header screen={screen} setScreen={navigateToStep} userName={profile.name} openProfile={openProfile} openHelp={openHelp} openApplication={openApplication} onLogout={logout} />
    <HelpPage data={data} onBack={backFromHelp} />
    <Box className="bottom-help"><ShieldOutlined /> Безопасно. Просто. На ваших условиях. <span>© Альфа-Бизнес · Кредитный кабинет</span></Box>
  </ThemeProvider>;

  const monthly = data.quote?.monthly ?? 0;
  const total = data.quote?.total ?? 0;
  const offers = data.goalOffers ?? data.precheck?.goalOffers ?? [];
  const chosen = offers[selectedOffer];
  const pages = [
    <CompanyPage key="company" data={data} update={update} next={next} lookupCompany={lookupCompany} profileCompany={profile.company ?? undefined} setToast={setToast} />,
    <GoalPage key="goal" data={data} update={update} next={next} />,
    <AmountPage key="amount" data={data} update={update} next={next} monthly={monthly} total={total} />,
    <FinancePage key="finance" data={data} update={update} next={next} company={data.company} setSelectedOffer={setSelectedOffer} onShowOffers={showOffers} />,
    <OffersPage key="offers" data={data} update={update} next={next} goalOffers={offers} selectedOffer={selectedOffer} setSelectedOffer={setSelectedOffer} monthly={monthly} chosen={chosen} setToast={setToast} onChoose={chooseOffer} />,
    <DocumentsPage key="documents" data={data} update={update} next={next} uploadFile={addDocument} />,
    <ReviewPage key="review" data={data} update={update} next={next} monthly={monthly} submit={submit} loading={loading} />,
    <StatusPage key="status" data={data} update={update} setData={setData} setScreen={setScreen} next={next} monthly={monthly} total={total} uploadDocument={addDocument} acceptOffer={accept} signOffer={sign} recalculateRoute={recalcRoute} />,
  ];

  return <ThemeProvider theme={theme}><CssBaseline />
    <Header screen={screen} setScreen={navigateToStep} userName={profile.name} openProfile={openProfile} openHelp={openHelp} openApplication={openApplication} onLogout={logout} />
    <Box className="app-shell"><StepRail screen={screen} setScreen={navigateToStep} /><Box component="main" className="main-content">
      {apiError && <Alert severity="error" onClose={() => setApiError("")} sx={{ mb: 2 }}>{apiError}</Alert>}
      {pages[screen]}
    </Box></Box>
    {toast && <Box className="toast-msg" onClick={() => setToast("")}>{toast}</Box>}
    <Box className="bottom-help"><ShieldOutlined /> Безопасно. Просто. На ваших условиях. <span>© Альфа-Бизнес · Кредитный кабинет</span></Box>
  </ThemeProvider>;
}

function RolePlaceholder({ profile, onLogout }: { profile: UserProfile; onLogout: () => void }) {
  return <Box className="role-placeholder"><Paper><Box className="brand-mark" sx={{ alignSelf: "center" }}>а</Box><Typography className="eyebrow">АЛЬФА-БИЗНЕС</Typography><Typography variant="h3">{profile.name}</Typography><Typography className="role-name">Роль: {roleLabels[profile.role].toLowerCase()}</Typography><Typography color="text.secondary">Раздел для этой роли появится после подключения API специалиста и админки.</Typography><Button variant="contained" onClick={onLogout}>Выйти</Button></Paper></Box>;
}

function toMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
