import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendChatMessage, extractText, type ChatMessage } from "../lib/chat";
import "../styles/shared.css";

// Real item name (NGJ-0001, Peacock Bridal Set) and a mix of tool coverage
// (item lookup, overdue, hypothetical-date availability, upcoming returns)
// — see backend/src/tools/index.ts. Tapping one only fills the input
// (doesn't auto-send), so a first-time user can still see/edit before
// sending.
const STARTER_QUESTIONS = [
  "Where is the Peacock Bridal Set?",
  "What's overdue this week?",
  "Is the Peacock Bridal Set free next weekend?",
  "What's due back in the next 3 days?",
];

// The model's replies commonly use **bold** for emphasis (item names, key
// facts) — rendered here rather than left as literal asterisks, since raw
// markdown syntax reads as broken to a non-technical user. Deliberately not
// a full markdown parser: this is the one construct Claude's answers
// actually use in practice.
function renderFormatted(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}

export default function AssistantPage() {
  // Session-only by design — plain React state, cleared on refresh/logout,
  // no persistence needed per the task.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function runTurn(convo: ChatMessage[]) {
    setSending(true);
    setError(null);
    try {
      const reply = await sendChatMessage(convo);
      setMessages([...convo, { role: "assistant", content: reply.message.content }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    runTurn(next);
  }

  function handleStarterTap(question: string) {
    setInput(question);
    inputRef.current?.focus();
  }

  function handleRetry() {
    runTurn(messages);
  }

  return (
    <div className="page chat-page">
      <h2>Ask the Assistant</h2>
      <p className="wizard-hint">Ask about items, bookings, or what's due — answers are pulled from real shop data.</p>

      {messages.length === 0 ? (
        <div className="chat-empty">
          <p className="chat-empty-hint">Not sure what to ask? Try one of these:</p>
          <div className="chat-starters">
            {STARTER_QUESTIONS.map((q) => (
              <button key={q} type="button" className="chat-starter-btn" onClick={() => handleStarterTap(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`chat-bubble ${m.role}`}>
              {renderFormatted(extractText(m.content))}
            </div>
          ))}
          {sending && (
            <div className="chat-bubble assistant chat-typing" aria-label="Assistant is thinking">
              <span />
              <span />
              <span />
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {error && (
        <div className="chat-error">
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={handleRetry} disabled={sending}>
            Retry
          </button>
        </div>
      )}

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          placeholder="Ask a question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button type="submit" className="btn-primary chat-send-btn" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
