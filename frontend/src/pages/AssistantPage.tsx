import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendChatMessage, extractText, type ChatMessage } from "../lib/chat";

const STARTER_QUESTIONS = [
  "Where is the Peacock Bridal Set?",
  "What's overdue this week?",
  "Is the Peacock Bridal Set free next weekend?",
  "What's due back in the next 3 days?",
];

function renderFormatted(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}

export default function AssistantPage() {
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
    <div className="container-fluid p-0">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="h3 mb-1 fw-semibold text-dark">AI Inventory Assistant</h1>
          <p className="text-muted mb-0 small">Ask questions about jewelry items, availability, returns, and customers in natural language</p>
        </div>
      </div>

      <div className="card border-0 shadow-sm d-flex flex-column" style={{ minHeight: "calc(100vh - 200px)" }}>
        <div className="card-header bg-white p-3 border-bottom d-flex align-items-center gap-2">
          <div className="avatar avatar-sm rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center fw-bold">
            AI
          </div>
          <div>
            <h6 className="mb-0 fw-semibold text-dark">NG Jewels Assistant</h6>
            <span className="text-success fs-7">
              <i className="ti ti-circle-filled fs-8 me-1"></i> Live shop data connected
            </span>
          </div>
        </div>

        <div className="card-body p-4 flex-grow-1 overflow-auto d-flex flex-column">
          {messages.length === 0 ? (
            <div className="my-auto text-center py-5">
              <div className="avatar avatar-xl rounded-circle bg-primary-subtle text-primary mx-auto mb-3 d-flex align-items-center justify-content-center">
                <i className="ti ti-message-bot fs-1"></i>
              </div>
              <h5 className="fw-bold text-dark mb-2">How can I help you today?</h5>
              <p className="text-muted small mb-4" style={{ maxWidth: 450, margin: "0 auto" }}>
                Ask about current stock locations, rental availability dates, overdue items, or upcoming customer returns.
              </p>

              <div className="d-flex flex-wrap justify-content-center gap-2" style={{ maxWidth: 600, margin: "0 auto" }}>
                {STARTER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="btn btn-outline-secondary btn-sm rounded-pill text-dark border py-2 px-3 bg-white hover-shadow"
                    onClick={() => handleStarterTap(q)}
                  >
                    <i className="ti ti-sparkles text-warning me-1"></i> {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="d-flex flex-column gap-3 mb-3">
              {messages.map((m, i) => (
                <div key={i} className={`d-flex ${m.role === "user" ? "justify-content-end" : "justify-content-start"}`}>
                  <div
                    className={`p-3 rounded-3 shadow-sm ${
                      m.role === "user" ? "bg-primary text-white" : "bg-light border text-dark"
                    }`}
                    style={{ maxWidth: "80%" }}
                  >
                    <div className="lh-base">{renderFormatted(extractText(m.content))}</div>
                  </div>
                </div>
              ))}

              {sending && (
                <div className="d-flex justify-content-start">
                  <div className="p-3 rounded-3 bg-light border text-muted d-flex align-items-center gap-2">
                    <span className="spinner-border spinner-border-sm text-primary" role="status"></span>
                    <span className="small">Checking shop data…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {error && (
            <div className="alert alert-danger py-2 px-3 small d-flex align-items-center justify-content-between my-2">
              <span>
                <i className="ti ti-alert-circle me-1"></i> {error}
              </span>
              <button type="button" className="btn btn-outline-danger btn-sm py-0" onClick={handleRetry} disabled={sending}>
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Bottom Input Area */}
        <div className="card-footer bg-white p-3 border-top">
          <form className="d-flex gap-2" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              className="form-control"
              placeholder="Ask the AI assistant a question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
            />
            <button type="submit" className="btn btn-primary fw-semibold d-flex align-items-center gap-1" disabled={sending || !input.trim()}>
              Send <i className="ti ti-send"></i>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
