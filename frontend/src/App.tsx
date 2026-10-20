import React, { useEffect, useMemo, useState } from "react";
import { Box, CssBaseline, ThemeProvider } from "@mui/material";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import theme from "./theme";
import { defaultData } from "./data/application";
import { formatMoney as money, loadApplication } from "./utils/format";
import { Header, StepRail } from "./components/ApplicationShell";
import GoalPage from "./pages/GoalPage";
import AmountPage from "./pages/AmountPage";
import CompanyPage from "./pages/CompanyPage";
import FinancePage from "./pages/FinancePage";
import OffersPage from "./pages/OffersPage";
import DocumentsPage from "./pages/DocumentsPage";
import ReviewPage from "./pages/ReviewPage";
import StatusPage from "./pages/StatusPage";
import type { ApplicationData, LoanOffer } from "./types";
import "./styles.css";

export default function App() {
  const [data, setData] = useState(loadApplication);
  const [screen, setScreen] = useState(data.submitted ? 7 : 0);
  const [selectedOffer, setSelectedOffer] = useState(data.offer || 0);
  const [toast, setToast] = useState("");

  useEffect(() => {
    localStorage.setItem("credit-demo", JSON.stringify(data));
  }, [data]);

  const update = <K extends keyof ApplicationData>(
    key: K,
    value: ApplicationData[K],
  ) => setData((current) => ({ ...current, [key]: value }));
  const monthly = useMemo(() => {
    const rate = 0.22 / 12;
    return (data.amount * rate) / (1 - Math.pow(1 + rate, -data.term));
  }, [data.amount, data.term]);
  const total = monthly * data.term;
  const next = (index = screen + 1) => {
    setScreen(index);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goalOffers: LoanOffer[] = data.goal.includes("кассов")
    ? [
        {
          name: "Овердрафт",
          amount: "до 500 000 ₽",
          detail: "Платите проценты только за дни, когда деньги взяты",
          why: "Подходит, если клиенты задерживают оплату",
          chance: 3,
        },
        {
          name: "Деньги на текущие расходы",
          amount: `до ${money(data.amount)}`,
          detail: `На ${data.term} месяцев · около ${money(monthly)} в месяц`,
          why: "Понятный платеж каждый месяц",
          chance: 3,
        },
        {
          name: "Кредитная линия",
          amount: "до 3 000 000 ₽",
          detail: "Берите деньги частями, когда нужно",
          why: "Удобно, если расходы возникают постепенно",
          chance: 2,
        },
      ]
    : [
        {
          name: "Деньги на текущие расходы",
          amount: `${money(data.amount)} на ${data.term} месяцев`,
          detail: `Платеж около ${money(monthly)} в месяц · всего вернете около ${money(total)}`,
          why: "Вы просили деньги на расходы, залог не нужен",
          chance: 3,
        },
        {
          name: "Овердрафт",
          amount: "Лимит до 500 000 ₽",
          detail: "Проценты только за дни, когда деньги взяты",
          why: "Подстраховка на случай задержки оплаты",
          chance: 3,
        },
        {
          name: "Кредитная линия",
          amount: "До 3 000 000 ₽",
          detail: "Берите по мере надобности, платите за взятое",
          why: "Гибкий доступ к деньгам частями",
          chance: 2,
        },
      ];
  const chosen = goalOffers[Math.min(selectedOffer, goalOffers.length - 1)];
  const submit = () => {
    update("submitted", true);
    update("outcome", "review");
    next(7);
  };

  const pages = [
    <GoalPage data={data} update={update} next={next} />,
    <AmountPage
      data={data}
      update={update}
      next={next}
      monthly={monthly}
      total={total}
    />,
    <CompanyPage data={data} update={update} next={next} setToast={setToast} />,
    <FinancePage
      data={data}
      update={update}
      next={next}
      setSelectedOffer={setSelectedOffer}
    />,
    <OffersPage
      data={data}
      update={update}
      next={next}
      goalOffers={goalOffers}
      selectedOffer={selectedOffer}
      setSelectedOffer={setSelectedOffer}
      monthly={monthly}
      chosen={chosen}
      setToast={setToast}
    />,
    <DocumentsPage data={data} update={update} next={next} />,
    <ReviewPage
      data={data}
      update={update}
      next={next}
      monthly={monthly}
      submit={submit}
    />,
    <StatusPage
      data={data}
      update={update}
      setData={setData}
      setScreen={setScreen}
      next={next}
      monthly={monthly}
      total={total}
    />,
  ];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Header screen={screen} setScreen={setScreen} />
      <Box className="app-shell">
        <StepRail screen={screen} setScreen={setScreen} />
        <Box component="main" className="main-content">
          {pages[screen]}
        </Box>
      </Box>
      {toast && <Box className="toast-msg">{toast}</Box>}
      <Box className="bottom-help">
        <ShieldOutlined /> Безопасно. Просто. На ваших условиях.{" "}
        <span>© Альфа-Бизнес · Демонстрационный кабинет</span>
      </Box>
    </ThemeProvider>
  );
}
