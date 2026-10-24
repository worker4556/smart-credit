import { useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Button, Chip, CircularProgress, Menu, MenuItem, Popover, Slider, TextField, Typography } from "@mui/material";
import AccountBalanceWallet from "@mui/icons-material/AccountBalanceWallet";
import AddBusiness from "@mui/icons-material/AddBusiness";
import ArrowForward from "@mui/icons-material/ArrowForward";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import Bolt from "@mui/icons-material/Bolt";
import Build from "@mui/icons-material/Build";
import CheckCircle from "@mui/icons-material/CheckCircle";
import HelpOutline from "@mui/icons-material/HelpOutline";
import ReceiptLong from "@mui/icons-material/ReceiptLong";
import Storefront from "@mui/icons-material/Storefront";
import NeuralParse, { type NeuralParseHandle } from "../components/NeuralParse";
import { api, type IntentResponse } from "../api";
import { goals } from "../data/application";
import type { GoalPageProps, LoanOffer } from "../types";
import { formatMoney } from "../utils/format";
import { goalInSentence, isOverdraftGoal, productName, productReason, tokenize } from "../utils/goal";

type Phase = "input" | "parsing" | "review";
type Field = "amount" | "term" | "goal";

const examples = [
  "Нужно 850 тысяч на 24 месяца на сезонную закупку зерна и сиропов",
  "Хочу 850 000 на два года, закупить товар к зиме",
];
const steps = ["Цель", "Компания", "Финансы", "Предложение", "Документы", "Отправка"];
const amountPresets = [300_000, 500_000, 850_000, 1_500_000, 3_000_000];
const termPresets = [6, 12, 18, 24, 36];
const outputLabels = ["Цель", "Сумма", "Срок", "Продукт"];
const nextSteps = [
  ["Компания", "уже из профиля"],
  ["Финансы", "можно пропустить"],
  ["Предложения", "сразу после проверки"],
];
const kindLabel: Record<string, string> = {
  REQUESTED: "Запрошенная сумма",
  WITHIN_ESTIMATE: "В пределах оценки",
  OTHER_TERM: "Другой срок",
  OTHER_PRODUCT: "Другой продукт",
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const money = (value: number | string) => (typeof value === "number" ? formatMoney(value) : value);

function iconFor(icon: string): ReactNode {
  if (icon === "receipt") return <ReceiptLong />;
  if (icon === "store") return <Storefront />;
  if (icon === "help") return <HelpOutline />;
  if (icon === "bolt") return <Bolt />;
  if (icon === "tool") return <Build />;
  if (icon === "expand") return <AddBusiness />;
  return <AccountBalanceWallet />;
}

export default function GoalPage({ data, update, next, previewOffers }: GoalPageProps) {
  const [description, setDescription] = useState(data.intentText ?? "");
  const [phase, setPhase] = useState<Phase>(data.intentText ? "review" : "input");
  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [refining, setRefining] = useState(false);
  const [refined, setRefined] = useState(false);
  const [parseError, setParseError] = useState("");
  const [tokens, setTokens] = useState<ReturnType<typeof tokenize>>([]);
  const [lit, setLit] = useState(-1);
  const [outputs, setOutputs] = useState<string[] | null>(null);
  const [modelWave, setModelWave] = useState(false);
  const [edit, setEdit] = useState<{ el: HTMLElement; field: Field } | null>(null);
  const [offers, setOffers] = useState<LoanOffer[] | null>(null);
  const [offersState, setOffersState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const netRef = useRef<NeuralParseHandle>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const previewRef = useRef(previewOffers);
  previewRef.current = previewOffers;
  const runId = useRef(0);

  // Подставляет распознанные поля в форму и возвращает, какими они стали
  const apply = (result: IntentResponse) => {
    const current = dataRef.current;
    const goal = result.goal && goals.some(([label]) => label === result.goal) ? result.goal : null;
    const next = { goal: goal ?? current.goal, amount: result.amount ?? current.amount, term: current.term };
    if (goal) update("goal", goal);
    if (isOverdraftGoal(next.goal)) next.term = 12;
    else if (result.term != null) next.term = result.term;
    if (result.amount != null) update("amount", result.amount);
    if (next.term !== current.term) update("term", next.term);
    return next;
  };

  // Сначала мгновенный ответ по правилам, затем уточнение языковой моделью в фоне:
  // клиент не ждёт модель, а уточнение применяется, только если он ещё не менял поля сам.
  // Сеть на экране показывает эти два прохода: белая волна — правила, янтарная — модель.
  const analyze = async () => {
    const text = description.trim();
    if (!text || phase === "parsing") return;
    const id = ++runId.current;
    const fast = reducedMotion();
    const words = tokenize(text);
    setTokens(words); setLit(-1); setOutputs(null); setModelWave(false);
    setIntent(null); setRefined(false); setParseError("");
    setPhase("parsing");
    const started = performance.now();
    await sleep(60); // сеть успевает появиться на экране
    const lightUp = (async () => {
      for (let i = 0; i < words.length && id === runId.current; i++) {
        setLit(i);
        netRef.current?.fire(i, "#ffffff");
        await sleep(fast ? 0 : 110);
      }
    })();
    let applied: ReturnType<typeof apply>;
    try {
      const [quick] = await Promise.all([api.intent(text, false), lightUp]);
      if (id !== runId.current) return;
      setIntent(quick);
      applied = apply(quick);
      setOutputs([
        quick.goal ?? "не распознана",
        quick.amount != null ? formatMoney(quick.amount) : "не указана",
        isOverdraftGoal(applied.goal) ? "12 мес." : quick.term != null ? `${quick.term} мес.` : "не указан",
        productName(applied.goal),
      ]);
    } catch {
      if (id === runId.current) {
        setParseError("Не получилось разобрать фразу. Нажмите на красные слова и выберите сами — это минута.");
        setPhase("review");
      }
      return;
    }
    await sleep(Math.max(0, (fast ? 0 : 1500) - (performance.now() - started)));
    if (id !== runId.current) return;
    setRefining(true);
    setModelWave(true);
    const smartCall = api.intent(text, true);
    words.forEach((word, i) => { if (word.kind === "goal" || i === 0) netRef.current?.fire(i, "#f5b544"); });
    await sleep(fast ? 0 : 1200);
    if (id !== runId.current) return;
    setPhase("review");
    try {
      const smart = await smartCall;
      const current = dataRef.current;
      const untouched = current.goal === applied.goal && current.amount === applied.amount && current.term === applied.term;
      if (id === runId.current && smart.source === "LLM" && untouched) {
        setIntent(smart);
        apply(smart);
        setRefined(true);
      }
    } catch {
      // уточнение не обязательно — ответ по правилам уже показан
    } finally {
      if (id === runId.current) setRefining(false);
    }
  };

  // Предварительные продукты банка: компания известна по учётке, предоценку можно показать уже на шаге 1
  useEffect(() => {
    if (phase !== "review" || !previewRef.current) return;
    let active = true;
    setOffersState("loading");
    const timer = window.setTimeout(() => {
      previewRef.current?.()
        .then((list) => { if (active) { setOffers(list); setOffersState("ready"); } })
        .catch(() => { if (active) setOffersState("error"); });
    }, 900);
    return () => { active = false; window.clearTimeout(timer); };
  }, [phase, data.goal, data.amount, data.term]);

  const chooseGoal = (label: string) => {
    update("goal", label);
    if (isOverdraftGoal(label)) update("term", 12);
    setEdit(null);
  };
  const pickOffer = (offer: LoanOffer) => {
    if (typeof offer.amount !== "number") return;
    const cashGap = goals[2][0];
    const goal = offer.product === "OVERDRAFT" ? cashGap : isOverdraftGoal(data.goal) ? goals[0][0] : data.goal;
    if (goal !== data.goal) update("goal", goal);
    update("amount", offer.amount);
    update("term", isOverdraftGoal(goal) ? 12 : offer.termMonths ?? data.term);
  };
  const cancel = () => {
    runId.current++;
    setDescription(""); update("intentText", ""); setIntent(null);
    setRefining(false); setRefined(false); setParseError(""); setPhase("input");
  };

  const overdraft = isOverdraftGoal(data.goal);
  const missing = intent?.missing ?? [];
  const goalMeta = goals.find(([label]) => label === data.goal);

  const token = (field: Field, label: string, text: string) => {
    const locked = field === "term" && overdraft;
    return (
      <button
        type="button"
        className={`goal-token ${missing.includes(field) ? "missing" : ""} ${locked ? "locked" : ""} ${edit?.field === field ? "active" : ""}`}
        disabled={locked}
        aria-haspopup="dialog"
        aria-label={locked ? `${label}: ${text}, для овердрафта не меняется` : `${label}: ${text}. Изменить`}
        onClick={(event) => setEdit({ el: event.currentTarget, field })}
      >
        {text}
        {missing.includes(field) && <span className="goal-token-q" aria-hidden="true">?</span>}
      </button>
    );
  };

  return (
    <Box className={`goal-stage goal-stage-${phase}`}>
      <Box className="goal-stage-bg" aria-hidden="true" />

      <Box className="goal-card">
        {phase === "input" && <Box className="goal-phase" key="input">
          <Typography className="goal-eyebrow">ШАГ 1 ИЗ 6 · ЗАДАЧА</Typography>
          <Typography component="h1" className="goal-title">Зачем деньги, сколько и на какой срок?</Typography>
          <Typography className="goal-sub">Напишите как удобно — помощник разложит на поля. Не хотите писать — заполните вручную.</Typography>
          <TextField
            multiline minRows={3} maxRows={6} value={description} autoFocus
            onChange={(event) => { setDescription(event.target.value); update("intentText", event.target.value); }}
            onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void analyze(); }}
            placeholder="Например: нужно 850 000 ₽ на 24 месяца на сезонную закупку товара"
            inputProps={{ "aria-label": "Опишите задачу финансирования" }}
            className="goal-textarea"
          />
          <Box className="goal-row">
            <Button variant="contained" className="goal-primary" disabled={!description.trim()} onClick={() => void analyze()} startIcon={<AutoAwesome />}>Разобрать</Button>
            <Button variant="text" className="goal-link" onClick={() => { setIntent(null); setPhase("review"); }}>Заполнить вручную</Button>
          </Box>
          <Typography className="goal-label">Фразы для примера</Typography>
          <Box className="goal-examples">
            {examples.map((example) => <Chip key={example} label={example} onClick={() => { setDescription(example); update("intentText", example); }} />)}
          </Box>
          <Typography className="goal-note">Решение принимает банк по своим правилам. Помощник только помогает заполнить заявку.</Typography>
        </Box>}

        {phase === "parsing" && <Box className="goal-phase" key="parsing" aria-live="polite">
          <Typography className="goal-eyebrow">ШАГ 1 ИЗ 6 · РАЗБИРАЕМ ЗАДАЧУ</Typography>
          <Box className="goal-phrase"><span>{description.trim()}</span><b>ВАША ФРАЗА</b></Box>
          <Box className="nn-panel">
            <Box className="nn-tokens">
              {tokens.map((t, i) => <span key={`${t.word}-${i}`} style={{ animationDelay: `${i * 45}ms` }}
                className={`nn-token ${i <= lit ? "lit" : ""} ${outputs && t.kind ? `kind-${t.kind}` : ""}`}>{t.word}</span>)}
            </Box>
            <NeuralParse ref={netRef} inputs={tokens.length} />
            <Box className="nn-outputs">
              {outputLabels.map((label, i) => <Box key={label} className={`nn-out nn-out-${i}`}>
                <small>{label.toUpperCase()}</small>
                <b>{outputs?.[i] ?? ""}</b>
                <span className="nn-bar"><i style={{ transform: `scaleX(${outputs ? (i === 0 && modelWave && !refined ? 0.6 : 0.95) : 0})` }} /></span>
              </Box>)}
            </Box>
            <Typography className={`nn-status ${modelWave ? "model" : ""}`}>
              <i />{modelWave ? "языковая модель уточняет цель · в фоне" : "правила · разбираем фразу"}
            </Typography>
          </Box>
        </Box>}

        {phase === "review" && <Box className="goal-phase" key="review">
          <Typography className="goal-eyebrow">{intent ? "ПРОВЕРЬТЕ, ПРАВИЛЬНО ЛИ МЫ ПОНЯЛИ" : "ШАГ 1 ИЗ 6 · ЗАДАЧА"}</Typography>
          {parseError && <Typography className="goal-error">{parseError}</Typography>}
          <Typography component="p" className="goal-sentence">
            Нужно {token("amount", "Сумма", formatMoney(data.amount))} на {token("term", "Срок", `${overdraft ? 12 : data.term} мес.`)}, чтобы{" "}
            <span className="goal-nowrap">{token("goal", "Цель", goalInSentence(data.goal))}.</span>
          </Typography>
          {(refining || refined) && <Typography className="goal-refine">
            {refining ? <><CircularProgress size={12} color="inherit" /> Помощник уточняет цель — поля можно править уже сейчас</> : <><CheckCircle /> Помощник уточнил цель</>}
          </Typography>}
          <Box className="goal-product">
            <span className={`goal-product-chip ${overdraft ? "overdraft" : ""}`}><AccountBalanceWallet />{productName(data.goal)}</span>
            <span>{intent?.productReason ?? productReason(data.goal)}</span>
          </Box>
          <Box className="goal-figures" aria-live="polite">
            <Box><small>Платёж в месяц</small><b>{data.quote ? `≈ ${formatMoney(data.quote.monthly)}` : "…"}</b></Box>
            <Box><small>Всего вернёте</small><b>{data.quote ? formatMoney(data.quote.total) : "…"}</b></Box>
            <Box><small>Ставка</small><b>{data.quote?.rate != null ? `${data.quote.rate}%` : "…"}</b></Box>
          </Box>
          <Box className="goal-next">
            {nextSteps.map(([title, note], i) => <Box key={title} className="goal-next-item">
              <span className="goal-next-num">{i + 2}</span><span><b>{title}</b><small>{note}</small></span>
            </Box>)}
          </Box>
          <Typography className="goal-hint">
            Нажмите на красное слово, чтобы изменить{goalMeta ? ` · ${goalMeta[1]}` : ""} ·{" "}
            <button type="button" className="goal-inline-link" onClick={() => setPhase("input")}>изменить фразу</button>
          </Typography>
          <Box className="goal-actions">
            <Button variant="text" className="goal-link" onClick={cancel}>Отмена</Button>
            <Button variant="contained" className="goal-primary" endIcon={<ArrowForward />} onClick={() => next(1)}>Подтвердить и продолжить</Button>
          </Box>
        </Box>}
      </Box>

      <Box className="goal-side" aria-live="polite">
        {phase === "review" && (offersState !== "idle" || offers) && <Box className={`goal-offers ${offersState === "loading" ? "refreshing" : ""}`}>
          <Typography className="goal-offers-label">Вам подходит · предварительно</Typography>
          {!offers && offersState === "loading" && <Box className="goal-offer skeleton"><CircularProgress size={16} /> Подбираем продукты…</Box>}
          {offers?.slice(0, 3).map((offer, i) => {
            const sameProduct = (offer.product === "OVERDRAFT") === overdraft;
            const selected = sameProduct && offer.amount === data.amount && (overdraft || offer.termMonths == null || offer.termMonths === data.term);
            return <Box component="button" type="button" key={`${offer.name}-${offer.amount}-${offer.termMonths ?? i}`}
              className={`goal-offer ${i === 0 && offer.kind ? "best" : ""} ${selected ? "selected" : ""}`}
              style={{ animationDelay: `${i * 90}ms` }} onClick={() => pickOffer(offer)}
              aria-label={`Выбрать: ${offer.name}, ${money(offer.amount)}`}>
              <span className="goal-offer-badges">
                {i === 0 && offer.kind && <span className="badge best">★ Лучший вариант</span>}
                {!offer.kind && <span className="badge low">Шансы низкие</span>}
                {offer.kind && i > 0 && kindLabel[offer.kind] && <span className="badge">{kindLabel[offer.kind]}</span>}
              </span>
              <b>{offer.name}</b>
              <span className="goal-offer-amount">{money(offer.amount)}</span>
              <span className="goal-offer-detail">{[
                offer.termMonths ? `${offer.termMonths} мес.` : null,
                offer.rate != null ? `${offer.rate}%` : null,
                offer.monthly ? `${formatMoney(offer.monthly)}/мес.` : null,
              ].filter(Boolean).join(" · ")}</span>
            </Box>;
          })}
          {offersState === "ready" && offers?.length === 0 && <Box className="goal-offer">Подходящих продуктов пока нет. Заявку всё равно можно отправить на проверку.</Box>}
          {offersState === "error" && !offers && <Box className="goal-offer">Предложения появятся после проверки компании.</Box>}
          <Typography className="goal-offers-fine">Точные условия — после проверки компании. Решение принимает банк.</Typography>
        </Box>}
      </Box>

      <Box className="goal-alt" aria-hidden="true">
        <span className="goal-alt-line" />
        <span className="goal-alt-flag">Решение</span>
        {steps.map((step, i) => <span key={step} className={`goal-alt-tick ${i === 0 ? "current" : ""}`} style={{ bottom: `${4 + i * 17}%` }}>{step}</span>)}
        <span className="goal-alt-me" style={{ bottom: "4%" }} />
      </Box>

      <Popover open={edit?.field === "amount"} anchorEl={edit?.el} onClose={() => setEdit(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }} slotProps={{ paper: { className: "goal-pop" } }}>
        <Box className="goal-pop-head"><span>Сумма</span><b>{formatMoney(data.amount)}</b></Box>
        <Slider min={50_000} max={5_000_000} step={50_000} value={data.amount} onChange={(_, value) => update("amount", Number(value))} aria-label="Сумма финансирования" />
        <Box className="slider-ends"><span>50 тыс.</span><span>5 млн</span></Box>
        <Box className="goal-pop-presets">{amountPresets.map((value) => <Chip key={value} size="small" label={value >= 1_000_000 ? `${value / 1_000_000} млн` : `${value / 1000} тыс.`}
          color={value === data.amount ? "primary" : "default"} onClick={() => update("amount", value)} />)}</Box>
      </Popover>

      <Popover open={edit?.field === "term"} anchorEl={edit?.el} onClose={() => setEdit(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }} slotProps={{ paper: { className: "goal-pop" } }}>
        <Box className="goal-pop-head"><span>Срок</span><b>{data.term} мес.</b></Box>
        <Slider min={3} max={36} step={1} value={data.term} onChange={(_, value) => update("term", Number(value))} aria-label="Срок в месяцах" />
        <Box className="slider-ends"><span>3 мес.</span><span>36 мес.</span></Box>
        <Box className="goal-pop-presets">{termPresets.map((value) => <Chip key={value} size="small" label={`${value} мес.`}
          color={value === data.term ? "primary" : "default"} onClick={() => update("term", value)} />)}</Box>
        <Typography className="goal-pop-note">Чем дольше срок, тем меньше платёж, но больше переплата</Typography>
      </Popover>

      <Menu open={edit?.field === "goal"} anchorEl={edit?.el} onClose={() => setEdit(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }} slotProps={{ paper: { className: "goal-menu" } }}>
        {goals.map(([label, subtitle, icon]) => <MenuItem key={label} selected={label === data.goal} onClick={() => chooseGoal(label)}>
          <span className="goal-menu-icon">{iconFor(icon)}</span>
          <span className="goal-menu-text"><b>{label}</b><small>{subtitle}</small></span>
          <span className={`goal-menu-product ${isOverdraftGoal(label) ? "overdraft" : ""}`}>{isOverdraftGoal(label) ? "овердрафт · 12 мес." : label === "Другое" ? "опишите" : "оборотный"}</span>
        </MenuItem>)}
      </Menu>
    </Box>
  );
}
