import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { runTool, toolDefinitions } from "../tools/index.js";

export const chatRouter = Router();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the assistant for Nitya Gehini Jewels, a jewelry rental and sales shop.
Answer using the provided tools only — never guess or invent an item's location, price,
availability, or financial figures. If a tool call returns nothing, say so plainly.

Reach for the right tool based on what's actually being asked:
- An item's location, price, or availability -> search_items / get_item_status / check_availability
- One customer's own booking history (by name or phone) -> get_customer_history
- How many customers exist, or a full customer list -> get_customer_summary
- Rentals due back soon, or already overdue -> get_upcoming_returns / get_overdue_rentals
- Revenue, expenses, profit, or "how much did we make" -> get_financial_summary
- Who owes money / outstanding balances -> get_outstanding_dues
- Lost or damaged item charges not yet settled -> get_outstanding_charges
- Most-booked / most popular items -> get_popular_items (leave include_collabs unset unless the
  question itself asks to include influencer/MUA bookings)
- Items that haven't been booked in a while -> get_idle_inventory
- A general "catch me up" / daily status check -> get_daily_briefing
- Looking up one specific booking by its code (e.g. BK-0001) -> get_booking_by_code`;

// POST /api/chat — body: { messages: Anthropic.MessageParam[] }
chatRouter.post("/", async (req, res) => {
  try {
    const messages: Anthropic.MessageParam[] = req.body.messages;
    // TEMPORARY debug capture — investigating a real tool-selection bug
    // report (get_upcoming_returns firing for a "going out" question).
    // Removed once the real tool call has been captured; not a permanent
    // feature.
    const _debugToolCalls: { name: string; input: unknown }[] = [];

    let response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    // Resolve tool calls in a loop until Claude returns a final text answer.
    while (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter((block) => block.type === "tool_use");
      for (const block of toolUses) _debugToolCalls.push({ name: block.name, input: block.input });
      const toolResults = await Promise.all(
        toolUses.map(async (block) => ({
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: JSON.stringify(await runTool(block.name, block.input as Record<string, unknown>)),
        }))
      );

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: toolDefinitions,
        messages,
      });
    }

    res.json({ message: response, _debug_tool_calls: _debugToolCalls });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

const SUGGESTIONS_SYSTEM_PROMPT = `Based on the conversation so far, suggest 2-3 short, natural
follow-up questions the user might want to ask next. Ground them specifically in what was just
discussed (the same item, customer, date range, etc.) — never generic questions unrelated to the
conversation.`;

// POST /api/chat/suggestions — a second, small call after the main reply, not
// part of the tool-use loop above: no tool access, forced to call
// suggest_questions so the response is reliably structured rather than
// prose to parse. Body: { messages } — the same conversation (including the
// reply just shown) sent to POST /.
chatRouter.post("/suggestions", async (req, res) => {
  try {
    const messages: Anthropic.MessageParam[] = req.body.messages;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      system: SUGGESTIONS_SYSTEM_PROMPT,
      tools: [
        {
          name: "suggest_questions",
          description: "Return 2-3 short follow-up questions grounded in the conversation so far.",
          input_schema: {
            type: "object" as const,
            properties: {
              questions: {
                type: "array",
                items: { type: "string" },
                minItems: 2,
                maxItems: 3,
              },
            },
            required: ["questions"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "suggest_questions" },
      messages,
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    const input = toolUse?.type === "tool_use" ? (toolUse.input as { questions?: unknown }) : undefined;
    const questions = Array.isArray(input?.questions) ? input.questions.filter((q): q is string => typeof q === "string") : [];
    res.json({ questions });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});
