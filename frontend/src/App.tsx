import React, { useCallback, useEffect, useState } from "react";
import { Alert, Box, CssBaseline, ThemeProvider } from "@mui/material";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import theme from "./theme";
import { defaultData } from "./data/application";
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
import { api, ApiError, type ApplicationResponse, type UserProfile } from "./api";
import type { ApplicationData, Company } from "./types";
import "./styles.css";

const PROFILE_SESSION_KEY = "credit-user-profile";
const COMPANY_SESSION_KEY = "credit-company-profile";

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

function getDemoAccount(id?: string): DemoAccount {
  return demoAccounts.find((account) => account.id === id) ?? DEFAULT_DEMO_ACCOUNT;
}

function applicationForAccount(account: DemoAccount): ApplicationData {
  return {
    ...defaultData,
    goal: account.goal,
    amount: account.amount,
    term: account.term,
    inn: account.company.inn,
    company: account.company,
    companyOk: false,
    monthlyRevenue: account.monthlyRevenue,
    hasLoans: account.hasLoans,
    loanPayment: account.loanPayment,
    hadOverdue2y: account.hadOverdue2y,
  };
}

export default function App() {
  const profile = loadProfileSession() ?? DEFAULT_DEMO_ACCOUNT.profile;
  const activeDemoAccount = getDemoAccount(profile.demoId);
  const [, setProfileRefresh] = useState(0);
  const [data, setData] = useState<ApplicationData>(() => {
    const storedCompany = loadCompanySession();
    const initial = applicationForAccount(activeDemoAccount);
    if (storedCompany.inn !== activeDemoAccount.company.inn) return initial;
    return { ...initial, ...storedCompany, inn: storedCompany.inn, company: storedCompany.company ?? initial.company };
  });
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
    sessionStorage.removeItem("credit-access-token");
    const savedProfile = loadProfileSession();
    if (!savedProfile?.demoId) {
      sessionStorage.setItem(PROFILE_SESSION_KEY, JSON.stringify(DEFAULT_DEMO_ACCOUNT.profile));
      sessionStorage.setItem(COMPANY_SESSION_KEY, JSON.stringify({ inn: DEFAULT_DEMO_ACCOUNT.company.inn, company: DEFAULT_DEMO_ACCOUNT.company }));
      setProfileRefresh((value) => value + 1);
    }
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
    let active = true;
    void api.createApplication(applicationForAccount(activeDemoAccount))
      .then((response) => { if (active) applyApplication(response); })
      .catch((error) => {
        if (active && !(error instanceof ApiError && error.status === 401)) {
          setApiError(toMessage(error, "Не удалось создать черновик"));
        }
      });
    return () => { active = false; };
  // A new backend draft follows the selected demo persona.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDemoAccount.id]);

  useEffect(() => {
    const savedCompany = JSON.stringify({ inn: data.inn, company: data.company });
    sessionStorage.setItem(COMPANY_SESSION_KEY, savedCompany);
    localStorage.setItem(COMPANY_SESSION_KEY, savedCompany);
  }, [data.inn, data.company]);

  const selectDemoAccount = (id: string) => {
    const account = getDemoAccount(id);
    sessionStorage.setItem(PROFILE_SESSION_KEY, JSON.stringify(account.profile));
    sessionStorage.setItem(COMPANY_SESSION_KEY, JSON.stringify({ inn: account.company.inn, company: account.company }));
    setProfileRefresh((value) => value + 1);
    setData(applicationForAccount(account));
    setScreen(0);
    setPage("application");
    setApiError("");
    setAmountError("");
    window.history.pushState({}, "", "/");
  };

  const update = <K extends keyof ApplicationData>(key: K, value: ApplicationData[K]) => {
    setData((current) => ({ ...current, [key]: value, ...(key === "amount" || key === "term" || key === "goal" ? { quote: undefined } : {}) }));
    if (key === "amount") setAmountError("");
  };

  useEffect(() => {
    if (screen !== 1 || !data.applicationId) return;
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
    if (screen !== 7 || !data.applicationId || !data.submitted || data.outcome !== "review") return;
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
  }, [screen, data.applicationId, data.submitted, data.outcome, applyApplication]);

  const next = async (index = screen + 1) => {
    if (data.applicationId && index !== 7) {
      try { await api.updateApplication(data.applicationId, data); }
      catch (error) { setApiError(toMessage(error, "Не удалось сохранить заявку")); return; }
    }
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
      let company: Company;
      try { company = await api.company(inn); }
      catch (error) {
        if (!(error instanceof ApiError && error.status === 500)) throw error;
        const cached = loadCompanySession();
        const fixture = demoAccounts.find((account) => account.company.inn === inn)?.company;
        if (cached.inn === inn && cached.company) company = cached.company;
        else if (fixture) company = fixture;
        else throw error;
      }
      setData((current) => ({ ...current, company, inn, companyOk: false, monthlyRevenue: company.account?.average_monthly_turnover ?? current.monthlyRevenue }));
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
  const recalcRoute = async (done: string[]) => {
    if (!data.applicationId) return;
    const route = await api.recalculateRoute(data.applicationId, done);
    setData((current) => ({ ...current, route }));
  };

  useEffect(() => {
    const onPopState = () => setPage(window.location.pathname === "/profile" ? "profile" : "application");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openProfile = () => { window.history.pushState({}, "", "/profile"); setPage("profile"); };
  const backFromProfile = () => { window.history.pushState({}, "", "/"); setPage("application"); };

  if (page === "profile") return <ThemeProvider theme={theme}><CssBaseline /><ProfilePage profile={profile} onBack={backFromProfile} /></ThemeProvider>;

  const monthly = data.quote?.monthly ?? 0;
  const total = data.quote?.total ?? 0;
  const offers = data.goalOffers ?? data.precheck?.goalOffers ?? [];
  const chosen = offers[selectedOffer];
  const pages = [
    <GoalPage key="goal" data={data} update={update} next={next} />,
    <AmountPage key="amount" data={data} update={update} next={next} monthly={monthly} total={total} />,
    <CompanyPage key="company" data={data} update={update} next={next} lookupCompany={lookupCompany} profileCompany={profile.company} setToast={setToast} />,
    <FinancePage key="finance" data={data} update={update} next={next} company={data.company} setSelectedOffer={setSelectedOffer} onShowOffers={showOffers} />,
    <OffersPage key="offers" data={data} update={update} next={next} goalOffers={offers} selectedOffer={selectedOffer} setSelectedOffer={setSelectedOffer} monthly={monthly} chosen={chosen} setToast={setToast} />,
    <DocumentsPage key="documents" data={data} update={update} next={next} uploadFile={addDocument} />,
    <ReviewPage key="review" data={data} update={update} next={next} monthly={monthly} submit={submit} loading={loading} />,
    <StatusPage key="status" data={data} update={update} setData={setData} setScreen={setScreen} next={next} monthly={monthly} total={total} uploadDocument={addDocument} acceptOffer={accept} recalculateRoute={recalcRoute} />,
  ];

  return <ThemeProvider theme={theme}><CssBaseline />
    <Header screen={screen} setScreen={setScreen} userName={profile.name} openProfile={openProfile}
      demoAccounts={demoAccounts.map(({ id, label }) => ({ id, label }))}
      selectedDemoId={activeDemoAccount.id} onDemoAccountChange={selectDemoAccount} />
    <Box className="app-shell"><StepRail screen={screen} setScreen={setScreen} /><Box component="main" className="main-content">
      {apiError && <Alert severity="error" onClose={() => setApiError("")} sx={{ mb: 2 }}>{apiError}</Alert>}
      {activeDemoAccount.notice && <Alert severity="info" sx={{ mb: 2 }}>{activeDemoAccount.notice}</Alert>}
      {pages[screen]}
    </Box></Box>
    {toast && <Box className="toast-msg" onClick={() => setToast("")}>{toast}</Box>}
    <Box className="bottom-help"><ShieldOutlined /> Безопасно. Просто. На ваших условиях. <span>© Альфа-Бизнес · Кредитный кабинет</span></Box>
  </ThemeProvider>;
}

function toMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
