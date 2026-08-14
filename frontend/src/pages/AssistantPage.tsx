import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendChatMessage, fetchChatSuggestions, extractText, type ChatMessage } from "../lib/chat";
import "../styles/shared.css";

// Deliberately item-agnostic — an earlier set named a specific real item
// ("Peacock Bridal Set") twice, which goes stale as inventory changes (sold,
// renamed, retired). These instead cover a mix of tools (daily briefing,
// overdue, outstanding dues, most-booked items) — see
// backend/src/tools/index.ts. Tapping one sends immediately (same as a
// per-reply suggestion chip below) rather than just filling the input.
const STARTER_QUESTIONS = [
  "Catch me up on today",
  "What's overdue this week?",
  "Who owes us money?",
  "What's our most popular set?",
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
  // Follow-up chips for the most recent reply only — cleared the instant a
  // new turn starts (typed, starter-tap, or suggestion-tap), so a stale set
  // can never linger under a newer reply.
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against a slow suggestions fetch from an earlier turn resolving
  // after a newer turn has already started and applying stale chips.
  const suggestionsRequestRef = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, suggestions]);

  function fetchSuggestionsFor(convo: ChatMessage[]) {
    const requestId = ++suggestionsRequestRef.current;
    fetchChatSuggestions(convo)
      .then((res) => {
        if (suggestionsRequestRef.current === requestId) setSuggestions(res.questions);
      })
      // Non-critical: a failed suggestions call should never surface as a
      // user-facing error or disrupt the main chat flow, just show none.
      .catch(() => {});
  }

  async function runTurn(convo: ChatMessage[]) {
    setSending(true);
    setError(null);
    try {
      const reply = await sendChatMessage(convo);
      const updated: ChatMessage[] = [...convo, { role: "assistant", content: reply.message.content }];
      setMessages(updated);
      fetchSuggestionsFor(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — please try again.");
    } finally {
      setSending(false);
    }
  }

  // Shared by the input form, starter-question taps, and suggestion-chip
  // taps — all three are just different ways to submit the same message,
  // typing included, so none of them get special-cased behavior.
  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    suggestionsRequestRef.current++; // invalidate any in-flight suggestions fetch
    setSuggestions([]);
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    runTurn(next);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
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
              <button key={q} type="button" className="chat-starter-btn" onClick={() => sendMessage(q)}>
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
          {!sending && suggestions.length > 0 && (
            <div className="chat-suggestions">
              {suggestions.map((q) => (
                <button key={q} type="button" className="chat-suggestion-chip" onClick={() => sendMessage(q)}>
                  {q}
                </button>
              ))}
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
