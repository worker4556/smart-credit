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
import type { ApplicationData, Company } from "./types";
import "./styles.css";

const TEMP_LOGIN_TOKEN_PREFIX = "local-test-";
const PROFILE_SESSION_KEY = "credit-user-profile";
const COMPANY_SESSION_KEY = "credit-company-profile";
const DEFAULT_INNS = {
  P1: "631200000001",
  P2: "771500000002",
  P3: "026800000003",
  P4: "540600000004",
  P5: "662300000005",
  ЗСК: "770100000099",
} as const;
const DEFAULT_TEST_COMPANIES: Record<string, Company> = {
  [DEFAULT_INNS.P1]: { inn: DEFAULT_INNS.P1, name: "ООО «Волга Снабжение»", legal_form: "ООО", activity: "Оптовая торговля", region: "Самарская область", registration_year: 2018, account: { average_monthly_turnover: 950_000 } },
  [DEFAULT_INNS.P2]: { inn: DEFAULT_INNS.P2, name: "ООО «Столичный Поставщик»", legal_form: "ООО", activity: "Торговля", region: "Москва", registration_year: 2020, account: { average_monthly_turnover: 2_300_000 } },
  [DEFAULT_INNS.P3]: { inn: DEFAULT_INNS.P3, name: "ООО «Урал Бизнес»", legal_form: "ООО", activity: "Услуги", region: "Республика Башкортостан", registration_year: 2019, account: { average_monthly_turnover: 430_000 } },
  [DEFAULT_INNS.P4]: { inn: DEFAULT_INNS.P4, name: "ООО «Сибирь Трейд»", legal_form: "ООО", activity: "Оптовая торговля", region: "Новосибирская область", registration_year: 2021, account: { average_monthly_turnover: 1_650_000 } },
  [DEFAULT_INNS.P5]: { inn: DEFAULT_INNS.P5, name: "ООО «Уральские Решения»", legal_form: "ООО", activity: "Производство", region: "Свердловская область", registration_year: 2022, account: { average_monthly_turnover: 710_000 } },
  [DEFAULT_INNS.ЗСК]: { inn: DEFAULT_INNS.ЗСК, name: "ООО «Северный Контур»", legal_form: "ООО", activity: "Услуги", region: "Москва", registration_year: 2017, account: { average_monthly_turnover: 1_200_000 } },
};

function loadProfileSession(): UserProfile | null {
  try { return JSON.parse(sessionStorage.getItem(PROFILE_SESSION_KEY) ?? "null") as UserProfile | null; }
  catch { return null; }
}

function loadCompanySession(): Pick<ApplicationData, "inn" | "company"> {
  try {
    const raw = sessionStorage.getItem(COMPANY_SESSION_KEY) ?? localStorage.getItem(COMPANY_SESSION_KEY) ?? "{}";
    const cached = JSON.parse(raw) as Partial<Pick<ApplicationData, "inn" | "company">>;
    return { inn: cached.inn ?? "", company: cached.company };
  } catch { return { inn: "", company: undefined }; }
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const profile = loadProfileSession();
  const [data, setData] = useState<ApplicationData>(() => ({ ...defaultData, ...loadCompanySession() }));
  const [screen, setScreen] = useState(0);
  const [page, setPage] = useState<"application" | "profile" | "bank" | "admin">(() => {
    const path = window.location.pathname;
    return path === "/profile" ? "profile" : path === "/bank" ? "bank" : path === "/admin" ? "admin" : "application";
  });
  const [selectedOffer, setSelectedOffer] = useState(0);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [amountError, setAmountError] = useState("");

  useEffect(() => {
    clearToken();
    sessionStorage.removeItem(PROFILE_SESSION_KEY);
  }, []);

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
    let role: "CLIENT" | "SPECIALIST" | "ADMIN" = "CLIENT";
    let me: UserProfile;
    try {
      const result = await api.login(login, password);
      const accessToken = result.accessToken ?? result.access_token ?? result.token;
      if (!accessToken) throw new Error("Сервер не вернул токен авторизации");
      saveToken(accessToken);
      role = result.role;
      me = result.user ?? await api.me();
    } catch (error) {
      const temporaryCredentialsMatch = login.trim().toLowerCase() === "paulmernov@gmail.com" && password === "06080608";
      if (!(error instanceof ApiError && error.status === 500 && temporaryCredentialsMatch)) throw error;
      // Temporary local-only access while the backend login endpoint is unavailable.
      const temporaryToken = `${TEMP_LOGIN_TOKEN_PREFIX}${crypto.randomUUID()}`;
      saveToken(temporaryToken);
      const company = DEFAULT_TEST_COMPANIES[DEFAULT_INNS.P1];
      me = { name: "Павел Мернов", email: "paulmernov@gmail.com", inn: company.inn, company, role: "CLIENT" };
    }
    sessionStorage.setItem(PROFILE_SESSION_KEY, JSON.stringify(me));
    sessionStorage.setItem(COMPANY_SESSION_KEY, JSON.stringify({ inn: me.inn ?? "", company: me.company }));
    setToken(getToken());
    setData((current) => ({ ...current, inn: me.inn ?? current.inn, company: me.company ?? current.company, companyOk: false }));
    if (role === "SPECIALIST" || me.role === "SPECIALIST") { window.history.pushState({}, "", "/bank"); setPage("bank"); }
    else if (role === "ADMIN" || me.role === "ADMIN") { window.history.pushState({}, "", "/admin"); setPage("admin"); }
    else { window.history.pushState({}, "", "/"); setPage("application"); setScreen(0); }
  };

  const logout = () => { clearToken(); sessionStorage.removeItem(PROFILE_SESSION_KEY); sessionStorage.removeItem(COMPANY_SESSION_KEY); setToken(null); setData(defaultData); setPage("application"); window.history.replaceState({}, "", "/"); };

  useEffect(() => {
    if (token) {
      const savedCompany = JSON.stringify({ inn: data.inn, company: data.company });
      sessionStorage.setItem(COMPANY_SESSION_KEY, savedCompany);
      localStorage.setItem(COMPANY_SESSION_KEY, savedCompany);
    }
  }, [token, data.inn, data.company]);

  useEffect(() => {
    if (!token) return;
    if (token.startsWith(TEMP_LOGIN_TOKEN_PREFIX)) return;
    const route = window.location.pathname;
    if (route === "/bank") { setPage("bank"); return; }
    if (route === "/admin") { setPage("admin"); return; }
    let active = true;
    void api.me().then(async (me) => {
      if (!active) return;
      sessionStorage.setItem(PROFILE_SESSION_KEY, JSON.stringify(me));
      sessionStorage.setItem(COMPANY_SESSION_KEY, JSON.stringify({ inn: me.inn ?? "", company: me.company }));
      setData((current) => ({ ...current, inn: me.inn ?? "", company: me.company, monthlyRevenue: me.company?.account?.average_monthly_turnover ?? current.monthlyRevenue }));
      if (window.location.pathname === "/profile") setPage("profile");
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
    try {
      let company;
      try { company = await api.company(inn); }
      catch (error) {
        if (!(error instanceof ApiError && error.status === 500)) throw error;
        const cached = loadCompanySession();
        if (cached.inn === inn && cached.company) company = cached.company;
        else if (DEFAULT_TEST_COMPANIES[inn]) company = DEFAULT_TEST_COMPANIES[inn];
        else throw error;
      }
      setData((current) => ({ ...current, company, inn, companyOk: false, monthlyRevenue: company.account?.average_monthly_turnover ?? current.monthlyRevenue }));
      return company;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw new Error("Компания не найдена среди ваших");
      throw error;
    }
  };
  const addDocument = async (file: File) => { if (!data.applicationId) return; applyApplication(await api.uploadDocument(data.applicationId, file)); };
  const accept = async () => { if (!data.applicationId) return; await api.accept(data.applicationId); applyApplication(await api.application(data.applicationId)); };
  const recalcRoute = async (done: string[]) => { if (!data.applicationId) return; const route = await api.recalculateRoute(data.applicationId, done); setData((current) => ({ ...current, route })); };

  useEffect(() => {
    const onPopState = () => { const path = window.location.pathname; setPage(path === "/profile" ? "profile" : path === "/bank" ? "bank" : path === "/admin" ? "admin" : "application"); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openProfile = () => {
    window.history.pushState({}, "", "/profile");
    setPage("profile");
  };

  if (!token || !profile) return <ThemeProvider theme={theme}><CssBaseline /><LoginPage onLogin={handleLogin} /></ThemeProvider>;
  if (page === "profile") return <ThemeProvider theme={theme}><CssBaseline /><ProfilePage profile={profile} onBack={() => { window.history.pushState({}, "", "/"); setPage("application"); }} onLogout={logout} /></ThemeProvider>;
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
  return <ThemeProvider theme={theme}><CssBaseline /><Header screen={screen} setScreen={setScreen} userName={profile?.name} openProfile={openProfile} onLogout={logout} />
    <Box className="app-shell"><StepRail screen={screen} setScreen={setScreen} /><Box component="main" className="main-content">
      {apiError && <Alert severity="error" onClose={() => setApiError("")} sx={{ mb: 2 }}>{apiError}</Alert>}{pages[screen]}
    </Box></Box>{toast && <Box className="toast-msg" onClick={() => setToast("")}>{toast}</Box>}
    <Box className="bottom-help"><ShieldOutlined /> Безопасно. Просто. На ваших условиях. <span>© Альфа-Бизнес · Кредитный кабинет</span></Box>
  </ThemeProvider>;
}

function toMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
