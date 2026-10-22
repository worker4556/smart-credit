import { useEffect, useMemo, useState } from "react";
import { Alert, Avatar, Box, Button, CircularProgress, IconButton, Paper, TextField, Typography } from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import Send from "@mui/icons-material/Send";
import { api, type AssistantAnswer } from "../api";
import type { ApplicationData } from "../types";

interface ChatMessage { id: string; question: string; answer: string; source?: AssistantAnswer["source"]; topic?: string; enhancing?: boolean; error?: boolean; }
interface HelpPageProps { data: ApplicationData; onBack: () => void; }

const prompts = ["Почему принято такое решение?", "Что мне делать дальше?", "Когда можно подать заявку снова?", "Что означает причина в решении?"];

export default function HelpPage({ data, onBack }: HelpPageProps) {
  const storageKey = useMemo(() => `credit-help-chat:${data.applicationId ?? "no-application"}`, [data.applicationId]);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) ?? "[]") as ChatMessage[]; } catch { return []; }
  });
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const allowed = ["rejected", "partial", "info"].includes(data.outcome);

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(messages)); } catch { /* Keep chat usable if session storage is unavailable. */ }
  }, [messages, storageKey]);

  const ask = async (value = question) => {
    const text = value.trim();
    if (!text || text.length > 500 || sending) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setQuestion("");
    if (!allowed || !data.applicationId) {
      const answer = !data.applicationId
        ? "Заявка ещё загружается. Попробуйте отправить вопрос чуть позже."
        : "Помощник сможет ответить по решению, когда банк запросит данные, предложит иные условия или откажет.";
      setMessages((current) => [...current, { id, question: text, answer, error: true }]);
      return;
    }
    setSending(true);
    setMessages((current) => [...current, { id, question: text, answer: "Готовим ответ…", enhancing: true }]);
    try {
      const template = await api.assistant(data.applicationId, text, false);
      setMessages((current) => current.map((message) => message.id === id ? { ...message, answer: template.answer, source: template.source, topic: template.topic, enhancing: template.source !== "LLM" } : message));
      setSending(false);
      if (template.source !== "LLM") {
        void api.assistant(data.applicationId, text, true).then((refined) => {
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
      <Typography color="text.secondary">Задайте вопрос о решении, причинах или следующих шагах. Ответ формируется по данным вашей заявки.</Typography>
    </Box>
    <Paper className="help-chat" elevation={0}>
      <Box className="help-chat-top"><Avatar><AutoAwesome /></Avatar><Box><Typography fontWeight={800}>Помощник Альфа-Бизнес</Typography><Typography variant="caption">Объясняет решение и маршрут по данным банка</Typography></Box></Box>
      <Box className="help-messages" aria-live="polite">
        <Box className="help-welcome"><Avatar><AutoAwesome /></Avatar><Paper><Typography>Здравствуйте! Я помогу разобраться в результате заявки и подскажу, что можно сделать дальше.</Typography><Typography variant="caption">Ответы основаны на данных решения и маршрута. Помощник не принимает кредитных решений.</Typography></Paper></Box>
        {messages.map((message) => <Box className="help-exchange" key={message.id}>
          <Paper className="help-user-message">{message.question}</Paper>
          <Box className="help-answer-row"><Avatar><AutoAwesome /></Avatar><Paper className={message.error ? "help-answer error" : "help-answer"}>
            <Typography>{message.answer}</Typography>
            <Box className="help-answer-meta">{message.source === "LLM" ? "Ответ уточнён помощником" : message.source === "TEMPLATE" ? "Ответ по правилам банка" : ""}{message.enhancing && <><CircularProgress size={12} /> Уточняем ответ…</>}</Box>
          </Paper></Box>
        </Box>)}
      </Box>
      {!allowed && <Alert severity="info" className="help-eligibility">Помощник по решению доступен, когда банк запросил данные, предложил иные условия или отказал. После обработки заявки здесь можно будет задать вопрос.</Alert>}
      {allowed && !data.applicationId && <Alert severity="warning" className="help-eligibility">Заявка ещё загружается. Попробуйте отправить вопрос чуть позже.</Alert>}
      <Box component="form" className="help-composer" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
        {messages.length === 0 && allowed && <Box className="help-prompts">{prompts.map((prompt) => <Button key={prompt} onClick={() => void ask(prompt)}>{prompt}</Button>)}</Box>}
        <TextField fullWidth multiline maxRows={4} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Спросите, что непонятно" inputProps={{ maxLength: 500, "aria-label": "Ваш вопрос помощнику" }} />
        <Typography className="help-count">{question.length}/500</Typography>
        <IconButton type="submit" aria-label="Отправить вопрос" disabled={sending || !question.trim()} className="help-send"><Send /></IconButton>
      </Box>
    </Paper>
  </Box>;
}
