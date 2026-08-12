import { apiFetch } from "./api";

// Deliberately not importing @anthropic-ai/sdk here — that's a backend-only
// dependency (see CLAUDE.md's "secrets stay backend-only" rule, which this
// mirrors for dependencies too). This is the minimal shape this app's own
// POST /api/chat actually needs: content is either a plain string (what we
// send for a user turn) or the raw content-block array Anthropic returns
// (what we resend for an assistant turn, unchanged, to keep the
// conversation grounded exactly as the model left it).
export interface ChatContentBlock {
  type: string;
  text?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ChatContentBlock[];
}

export interface ChatReply {
  message: {
    content: ChatContentBlock[];
  };
}

export function extractText(content: string | ChatContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n\n");
}

// POST /api/chat — body: { messages }, behind requireAuth. The backend
// resolves any tool_use loop itself and only ever returns a final,
// text-only assistant message (see backend/src/routes/chat.ts) — the
// frontend never sees a tool_use block.
export function sendChatMessage(messages: ChatMessage[]) {
  return apiFetch<ChatReply>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}
