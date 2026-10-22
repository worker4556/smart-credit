import { useEffect, useMemo, useState } from "react";
import { Alert, Avatar, Box, Button, CircularProgress, IconButton, Paper, TextField, Typography } from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import Send from "@mui/icons-material/Send";
import { api, ApiError, type AssistantAnswer } from "../api";
import type { ApplicationData } from "../types";

interface ChatMessage { id: string; question: string; answer: string; source?: AssistantAnswer["source"]; topic?: string; enhancing?: boolean; error?: boolean; }
interface HelpPageProps { data: ApplicationData; onBack: () => void; onStaleApplication: () => Promise<string | undefined>; }

// Подсказки под стадию заявки: помощник отвечает и когда всё хорошо, не только при отказе
function promptsFor(data: ApplicationData): string[] {
  if (["rejected", "partial", "info"].includes(data.outcome) && data.status !== "WITHDRAWN" && data.status !== "EXPIRED")
    return ["Почему принято такое решение?", "Что мне делать дальше?", "Когда можно подать заявку снова?", "Что означает причина в решении?"];
  if (!data.submitted) return ["Почему такой шанс?", "Что мне делать дальше?", "Почему такая сумма?", "Что такое полная стоимость кредита?"];
  if (["review", "specialist"].includes(data.outcome)) return ["Когда будет решение?", "Что мне делать сейчас?", "Что такое скоринг?"];
  return ["Почему одобрили?", "Что дальше?", "Сколько это стоит?", "Что такое полная стоимость кредита?"];
}

export default function HelpPage({ data, onBack, onStaleApplication }: HelpPageProps) {
  const storageKey = useMemo(() => `credit-help-chat:${data.applicationId ?? "no-application"}`, [data.applicationId]);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) ?? "[]") as ChatMessage[]; } catch { return []; }
  });
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const prompts = promptsFor(data);

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(messages)); } catch { /* Keep chat usable if session storage is unavailable. */ }
  }, [messages, storageKey]);

  const ask = async (value = question) => {
    const text = value.trim();
    if (!text || text.length > 500 || sending) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setQuestion("");
    if (!data.applicationId) {
      setMessages((current) => [...current, { id, question: text, answer: "Заявка ещё загружается. Попробуйте отправить вопрос чуть позже.", error: true }]);
      return;
    }
    setSending(true);
    setMessages((current) => [...current, { id, question: text, answer: "Готовим ответ…", enhancing: true }]);
    try {
      let applicationId = data.applicationId;
      let template: AssistantAnswer;
      try {
        template = await api.assistant(applicationId, text, false);
      } catch (error) {
        // Заявку удалили (например, сброс демо) — берём актуальную и задаём вопрос ещё раз
        if (!(error instanceof ApiError && error.status === 404)) throw error;
        const fresh = await onStaleApplication();
        if (!fresh) throw error;
        applicationId = fresh;
        template = await api.assistant(applicationId, text, false);
      }
      setMessages((current) => current.map((message) => message.id === id ? { ...message, answer: template.answer, source: template.source, topic: template.topic, enhancing: template.source !== "LLM" } : message));
      setSending(false);
      if (template.source !== "LLM") {
        void api.assistant(applicationId, text, true).then((refined) => {
          if (refined.source === "LLM") setMessages((current) => current.map((message) => message.id === id ? { ...message, answer: refined.answer, source: refined.source, topic: refined.topic, enhancing: false } : message));
          else setMessages((current) => current.map((message) => message.id === id ? { ...message, enhancing: false } : message));
        }).catch(() => setMessages((current) => current.map((message) => message.id === id ? { ...message, enhancing: false } : message)));
      }
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === id ? { ...message, answer: error instanceof Error ? error.message : "Не удалось получить ответ. Попробуйте ещё раз.", error: true, enhancing: false } : message));
      setSending(false);
    }
  };

  return <Box className="help-page">
    <Box className="help-heading">
      <Button startIcon={<ArrowBack />} onClick={onBack}>К заявке</Button>
      <Typography className="eyebrow">ПОМОЩЬ ПО ЗАЯВКЕ</Typography>
      <Typography variant="h2">Чем можем помочь?</Typography>
      <Typography color="text.secondary">Спросите о шансах, условиях, следующих шагах или непонятном слове. Ответ формируется по данным вашей заявки — на любом этапе.</Typography>
    </Box>
    <Paper className="help-chat" elevation={0}>
      <Box className="help-chat-top"><Avatar><AutoAwesome /></Avatar><Box><Typography fontWeight={800}>Помощник Альфа-Бизнес</Typography><Typography variant="caption">Объясняет шансы, решение и следующие шаги по данным банка</Typography></Box></Box>
      <Box className="help-messages" aria-live="polite">
        <Box className="help-welcome"><Avatar><AutoAwesome /></Avatar><Paper><Typography>Здравствуйте! Я помогу разобраться с заявкой на любом этапе: что значит предварительный шанс, что делать дальше, из чего складывается стоимость.</Typography><Typography variant="caption">Ответы основаны только на данных вашей заявки. Помощник не принимает кредитных решений.</Typography></Paper></Box>
        {messages.map((message) => <Box className="help-exchange" key={message.id}>
          <Paper className="help-user-message">{message.question}</Paper>
          <Box className="help-answer-row"><Avatar><AutoAwesome /></Avatar><Paper className={message.error ? "help-answer error" : "help-answer"}>
            <Typography>{message.answer}</Typography>
            <Box className="help-answer-meta">{message.source === "LLM" ? "Ответ уточнён помощником" : message.source === "TEMPLATE" ? "Ответ по правилам банка" : ""}{message.enhancing && <><CircularProgress size={12} /> Уточняем ответ…</>}</Box>
          </Paper></Box>
        </Box>)}
      </Box>
      {!data.applicationId && <Alert severity="warning" className="help-eligibility">Заявка ещё загружается. Попробуйте отправить вопрос чуть позже.</Alert>}
      <Box component="form" className="help-composer" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
        {messages.length === 0 && <Box className="help-prompts">{prompts.map((prompt) => <Button key={prompt} onClick={() => void ask(prompt)}>{prompt}</Button>)}</Box>}
        <TextField fullWidth multiline maxRows={4} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} placeholder="Спросите, что непонятно (Enter — отправить, Shift+Enter — новая строка)" inputProps={{ maxLength: 500, "aria-label": "Ваш вопрос помощнику" }} />
        <Typography className="help-count">{question.length}/500</Typography>
        <IconButton type="submit" aria-label="Отправить вопрос" disabled={sending || !question.trim()} className="help-send"><Send /></IconButton>
      </Box>
    </Paper>
  </Box>;
}
