// Minimal **bold** rendering, shared by any page that wants it without
// pulling in a full markdown parser — same one-construct-only approach
// AssistantPage.tsx already uses for chat replies, kept here as its own
// small net-new helper so this page doesn't need to modify that one.
export function renderBold(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
    );
}
