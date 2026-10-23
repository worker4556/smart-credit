import React, { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, CssBaseline, ThemeProvider, Typography } from "@mui/material";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import theme from "./theme";
import { defaultData, goals } from "./data/application";
import { DEFAULT_DEMO_ACCOUNT, demoAccounts, type DemoAccount } from "./data/demoAccounts";
import { Header, StepRail } from "./components/ApplicationShell";
import GoalPage from "./pages/GoalPage";
import CompanyPage from "./pages/CompanyPage";
import FinancePage from "./pages/FinancePage";
import OffersPage from "./pages/OffersPage";
import DocumentsPage from "./pages/DocumentsPage";
import ReviewPage from "./pages/ReviewPage";
import StatusPage from "./pages/StatusPage";
import ProfilePage from "./pages/ProfilePage";
import LoginPage from "./pages/LoginPage";
import HelpPage from "./pages/HelpPage";
import BankPage from "./pages/BankPage";
import AdminPage from "./pages/AdminPage";
import LandingPage from "./pages/LandingPage";
import { api, ApiError, clearToken, getToken, saveToken, type ApplicationResponse, type UserProfile } from "./api";
import type { ApplicationData, Company } from "./types";
import "./styles.css";

const PROFILE_SESSION_KEY = "credit-user-profile";

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
  const [page, setPage] = useState<"home" | "login" | "application" | "profile" | "help" | "bank" | "admin">(() => {
    const path = window.location.pathname;
    return path === "/profile" ? "profile" : path === "/login" ? "login" : path === "/application" ? "application" : path === "/help" ? "help" : path === "/bank" ? "bank" : path === "/admin" ? "admin" : "home";
  });
  const [returnToPage, setReturnToPage] = useState<"home" | "application">("home");
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
      setPage(user.role === "CLIENT" && window.location.pathname === "/profile" ? "profile" : window.location.pathname === "/application" ? "application" : "home");
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

  // Открывает актуальную заявку клиента: свежий черновик продолжаем, отправленную показываем на экране статуса,
  // нет ни одной — создаём черновик. Вызывается при входе и когда текущая заявка пропала (например, сброс демо).
  const syncApplication = useCallback(async (): Promise<string | undefined> => {
    if (!profile || profile.role !== "CLIENT") return undefined;
    const draft = applicationForAccount(demoAccountForLogin(profile.login), profile);
    setData(draft);
    setSelectedOffer(0);
    const list = await api.applications();
    const latest = list[0];
    if (latest?.status === "DRAFT") {
      applyApplication(latest);
      setScreen(0);
      return latest.applicationId;
    }
    if (latest) {
      applyApplication(latest);
      setScreen(6);
      if (["REJECTED", "COUNTER_OFFER", "DECLINED_BY_CLIENT"].includes(latest.status ?? "") && latest.applicationId) {
        const route = await api.route(latest.applicationId);
        setData((current) => ({ ...current, route }));
      }
      return latest.applicationId;
    }
    const response = await api.createApplication(draft);
    applyApplication(response);
    setScreen(0);
    return response.applicationId ?? response.id;
  }, [profile, applyApplication]);

  // 404 по текущей заявке — её больше нет: молча переключаемся на актуальную
  const recoverIfStale = useCallback(async (error: unknown): Promise<boolean> => {
    if (!(error instanceof ApiError && error.status === 404)) return false;
    try { await syncApplication(); setApiError(""); setToast("Данные заявки обновились — открыли актуальную"); window.setTimeout(() => setToast(""), 3000); }
    catch (syncError) { setApiError(toMessage(syncError, "Не удалось загрузить заявку")); }
    return true;
  }, [syncApplication]);

  useEffect(() => {
    if (!isAuthenticated || !profile || profile.role !== "CLIENT") return;
    void syncApplication().catch((error) => {
      if (error instanceof ApiError && error.status === 401) return;
      setApiError(toMessage(error, "Не удалось загрузить заявку"));
    });
  }, [profile, isAuthenticated, syncApplication]);

  const loginWithPassword = async (login: string, password: string) => {
    const response = await api.login(login, password);
    saveToken(response.accessToken);
    const user = response.user;
    sessionStorage.setItem(PROFILE_SESSION_KEY, JSON.stringify(user));
    setProfile(user);
    setData(applicationForAccount(demoAccountForLogin(user.login), user));
    setScreen(0);
    const destination = user.role === "SPECIALIST" ? "/bank" : user.role === "ADMIN" ? "/admin" : "/application";
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
    setPage("home");
    setAuthNotice("");
    window.history.pushState({}, "", "/");
  };

  const update = <K extends keyof ApplicationData>(key: K, value: ApplicationData[K]) => {
    setData((current) => ({ ...current, [key]: value, ...(key === "amount" || key === "term" || key === "goal" ? { quote: undefined } : {}) }));
    if (key === "amount") setAmountError("");
  };

  useEffect(() => {
    if (screen !== 0 || !data.applicationId) return;
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
    if (screen !== 6 || !data.applicationId || !data.submitted || !["review", "specialist", "signed"].includes(data.outcome)) return;
    const timer = window.setInterval(() => void api.application(data.applicationId!)
      .then(async (record) => {
        applyApplication(record);
        if (["rejected", "partial"].includes(record.outcome) && !record.route) {
          const route = await api.route(data.applicationId!);
          setData((current) => ({ ...current, route }));
        }
      })
      .catch(async (error) => { if (!(await recoverIfStale(error))) setApiError(toMessage(error, "Не удалось обновить статус заявки")); }), 3000);
    return () => window.clearInterval(timer);
  }, [screen, data.applicationId, data.submitted, data.outcome, data.status, applyApplication]);

  const saveDraft = async (snapshot: ApplicationData = data) => {
    if (!snapshot.applicationId) return undefined;
    const createDraft = async () => {
      const created = await api.createApplication(snapshot);
      const newId = created.applicationId ?? created.id;
      if (!newId) throw new Error("Backend не вернул номер нового черновика");
      applyApplication(created);
      setToast("Предыдущая заявка уже отправлена. Продолжаем заполнение в новом черновике.");
      return newId;
    };
    if (snapshot.submitted) return createDraft();
    try {
      await api.updateApplication(snapshot.applicationId, snapshot);
      return snapshot.applicationId;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) return createDraft();
      throw error;
    }
  };

  const next = async (index = screen + 1) => {
    if (data.applicationId && index !== 6) {
      try { await saveDraft(); }
      catch (error) { setApiError(toMessage(error, "Не удалось сохранить заявку")); return; }
    }
    setApiError("");
    setScreen(index);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const navigateToStep = async (index: number) => {
    if (index === screen) return;
    if (index > 0 && data.applicationId) {
      try { await saveDraft(); }
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
      const applicationId = await saveDraft();
      if (!applicationId) return;
      const result = await api.precheck(applicationId);
      setData((current) => ({ ...current, precheck: result, goalOffers: result.goalOffers }));
      setSelectedOffer(0); setScreen(3);
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
      try { await saveDraft(updated); }
      catch (error) { setApiError(toMessage(error, "Не удалось сохранить заявку")); return; }
    }
    setScreen(4);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startNewApplication = async () => {
    const draft = applicationForAccount(demoAccountForLogin(profile?.login), profile ?? undefined);
    setData(draft);
    setSelectedOffer(0);
    setScreen(0);
    try { applyApplication(await api.createApplication(draft)); }
    catch (error) { setApiError(toMessage(error, "Не удалось создать черновик")); }
  };

  const submit = async () => {
    if (!data.applicationId) return;
    setLoading(true); setApiError("");
    try {
      const response = await api.submit(data.applicationId, data);
      applyApplication(response);
      setData((current) => ({ ...current, submitted: true, outcome: "review" }));
      setScreen(6); window.scrollTo({ top: 0, behavior: "smooth" });
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

  const addDocument = async (file: File, docId?: string) => {
    if (!data.applicationId) return;
    applyApplication(await api.uploadDocument(data.applicationId, file, docId));
    if (docId) setData((current) => ({ ...current, docs: { ...current.docs, [docId]: file.name } }));
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
  // Клиент отклонил иные условия — маршрут строится от решения (что держит сумму)
  const decline = async () => {
    if (!data.applicationId) return;
    try {
      await api.decline(data.applicationId);
      applyApplication(await api.application(data.applicationId));
      const route = await api.route(data.applicationId);
      setData((current) => ({ ...current, route }));
    } catch (error) { setApiError(toMessage(error, "Не удалось отклонить предложение")); }
  };
  const withdraw = async () => {
    if (!data.applicationId) return;
    try {
      await api.withdraw(data.applicationId);
      applyApplication(await api.application(data.applicationId));
    } catch (error) { setApiError(toMessage(error, "Не удалось отозвать заявку")); }
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
      setPage(path === "/profile" ? "profile" : path === "/login" ? "login" : path === "/application" ? "application" : path === "/help" ? "help" : path === "/bank" ? "bank" : path === "/admin" ? "admin" : "home");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openProfile = () => {
    if (!isAuthenticated || !profile) { window.history.pushState({}, "", "/login"); setPage("login"); return; }
    setReturnToPage(page === "application" ? "application" : "home");
    window.history.pushState({}, "", "/profile"); setPage("profile");
  };
  const openHome = () => {
    if (window.location.pathname !== "/") window.history.pushState({}, "", "/");
    setPage("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const backFromProfile = () => { const destination = returnToPage === "application" ? "/application" : "/"; window.history.pushState({}, "", destination); setPage(returnToPage); };
  const openHelp = () => { window.history.pushState({}, "", "/help"); setPage("help"); };
  const backFromHelp = () => { window.history.pushState({}, "", "/application"); setPage("application"); };
  const openApplication = (targetScreen: number) => {
    if (window.location.pathname !== "/application") window.history.pushState({}, "", "/application");
    setPage("application");
    if (targetScreen === screen) return;
    void navigateToStep(targetScreen);
  };

  if (checkingSession) return <ThemeProvider theme={theme}><CssBaseline /><Box className="login-page"><Typography>Проверяем учётную запись…</Typography></Box></ThemeProvider>;
  if (!isAuthenticated || !profile) {
    if (page === "login") return <ThemeProvider theme={theme}><CssBaseline /><LoginPage onLogin={loginWithPassword} onBack={() => { window.history.pushState({}, "", "/"); setPage("home"); }} notice={authNotice} /></ThemeProvider>;
    return <ThemeProvider theme={theme}><CssBaseline /><LandingPage onStart={() => { window.history.pushState({}, "", "/login"); setPage("login"); }} onProfile={openProfile} /></ThemeProvider>;
  }
  if (profile.role === "SPECIALIST") return <ThemeProvider theme={theme}><CssBaseline /><BankPage userName={profile.name} onLogout={logout} /></ThemeProvider>;
  if (profile.role === "ADMIN") return <ThemeProvider theme={theme}><CssBaseline /><AdminPage userName={profile.name} onLogout={logout} /></ThemeProvider>;
  if (page === "home") return <ThemeProvider theme={theme}><CssBaseline /><LandingPage userName={profile.name} application={data} onStart={() => openApplication(0)} onProfile={openProfile} onLogout={logout} onHome={openHome} /></ThemeProvider>;
  if (page === "profile") return <ThemeProvider theme={theme}><CssBaseline /><ProfilePage profile={profile} onBack={backFromProfile} /></ThemeProvider>;
  if (page === "help") return <ThemeProvider theme={theme}><CssBaseline />
    <Header screen={screen} setScreen={navigateToStep} userName={profile.name} openProfile={openProfile} openHome={openHome} openHelp={openHelp} openApplication={openApplication} onLogout={logout} />
    <HelpPage data={data} onBack={backFromHelp} onStaleApplication={syncApplication} />
    <Box className="bottom-help"><ShieldOutlined /> Безопасно. Просто. На ваших условиях. <span>© Альфа-Бизнес · Кредитный кабинет</span></Box>
  </ThemeProvider>;

  const monthly = data.quote?.monthly ?? 0;
  const total = data.quote?.total ?? 0;
  const offers = data.goalOffers ?? data.precheck?.goalOffers ?? [];
  const chosen = offers[selectedOffer];
  const pages = [
    <GoalPage key="goal" data={data} update={update} next={next} />,
    <CompanyPage key="company" data={data} update={update} next={next} lookupCompany={lookupCompany} profileCompany={profile.company ?? undefined} setToast={setToast} />,
    <FinancePage key="finance" data={data} update={update} next={next} company={data.company} setSelectedOffer={setSelectedOffer} onShowOffers={showOffers} />,
    <OffersPage key="offers" data={data} update={update} next={next} goalOffers={offers} selectedOffer={selectedOffer} setSelectedOffer={setSelectedOffer} monthly={monthly} chosen={chosen} setToast={setToast} onChoose={chooseOffer} />,
    <DocumentsPage key="documents" data={data} update={update} next={next} uploadFile={addDocument} />,
    <ReviewPage key="review" data={data} update={update} next={next} monthly={monthly} submit={submit} loading={loading} />,
    <StatusPage key="status" data={data} update={update} setData={setData} setScreen={setScreen} next={next} monthly={monthly} total={total} uploadDocument={addDocument} acceptOffer={accept} signOffer={sign} declineOffer={decline} withdrawApplication={withdraw} onNewApplication={startNewApplication} recalculateRoute={recalcRoute} />,
  ];

  return <ThemeProvider theme={theme}><CssBaseline />
    <Header screen={screen} setScreen={navigateToStep} userName={profile.name} openProfile={openProfile} openHome={openHome} openHelp={openHelp} openApplication={openApplication} onLogout={logout} />
    <Box className="app-shell"><StepRail screen={screen} setScreen={navigateToStep} /><Box component="main" className="main-content">
      {apiError && <Alert severity="error" onClose={() => setApiError("")} sx={{ mb: 2 }}>{apiError}</Alert>}
      {pages[screen]}
    </Box></Box>
    {toast && <Box className="toast-msg" onClick={() => setToast("")}>{toast}</Box>}
    <Box className="bottom-help"><ShieldOutlined /> Безопасно. Просто. На ваших условиях. <span>© Альфа-Бизнес · Кредитный кабинет</span></Box>
  </ThemeProvider>;
}


function toMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
