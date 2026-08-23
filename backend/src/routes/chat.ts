import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { runTool, toolDefinitions } from "../tools/index.js";

export const chatRouter = Router();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the assistant for Nitya Gehini Jewels, a jewelry rental and sales shop.
Answer using the provided tools only — never guess or invent an item's location, price,
availability, or financial figures. If a tool call returns nothing, say so plainly.

If asked what you can do, what features you have, or "what can I ask you" — this is a question
about YOU, not the shop's data, so don't call a tool for it. Answer directly and plainly, in the
shop owner's own words rather than tool names: you can look up an item's status/location, check
if an item is free for a given date range, see how much one item has earned, look up a customer's
own booking history and what they owe, see who owes money shop-wide, see what's going out for
pickup or coming back for return (including anything overdue), check the shop's overall revenue
and profit for a period, find the most popular items or ones that haven't been booked in a while,
find repeat/loyal customers, and pull up one booking's full detail by its code. Keep it to a
short, friendly list, not the whole tool catalogue verbatim.

Reach for the right tool based on what's actually being asked:
- An item's CURRENT status, location, or general info -> search_items / get_item_status. No date
  range involved — if a date range is mentioned, that's get_item_availability instead, below.
- Is one specific item free/available for a given date range (e.g. "is X free 19-22 Sept", "how
  many bangles are left next weekend") -> get_item_availability. A hypothetical range check, not
  the item's current status — never search_items/get_item_status for this.
- ONE customer's own booking history, by name -> get_customer_history. About a single named
  customer only — never use this for shop-wide questions (those are get_outstanding_dues or
  get_financial_summary below).
- How many customers exist, or a full customer list -> get_customer_summary
- Items going OUT to a customer soon — picking up, handing over, "what's going out next",
  "what needs to be picked up" -> get_upcoming_pickups. This is direction-sensitive: these
  questions are about items LEAVING the shop, never about items coming back.
- Rentals due BACK soon, or already overdue -> get_upcoming_returns / get_overdue_rentals.
  These are about items customers are RETURNING, the opposite direction from pickups — do not
  use these (or get_daily_briefing) for a "going out" / pickup / hand-over question, even if it's
  phrased as a general status check.
- OUR revenue — the whole shop's, "how much did we make", expenses, profit, OR a plain "how many
  bookings did we have this week/month" count -> get_financial_summary. Whole-shop only — never
  use this for one item's or one customer's own numbers.
- ONE SPECIFIC item's own revenue ("how much has X earned/made us") -> get_item_revenue. Never
  get_financial_summary for a single-item question, and never call this for a whole-shop question.
- Who owes money / outstanding balances, shop-wide -> get_outstanding_dues. If the question names
  one specific customer instead, use get_customer_history's own outstanding_balance field, not this.
- Lost or damaged item charges not yet settled -> get_outstanding_charges
- Most-booked / most popular items -> get_popular_items (leave include_collabs unset unless the
  question itself asks to include influencer/MUA bookings)
- Items that haven't been booked in a while -> get_idle_inventory
- "Who is our most repeated/frequent/loyal customer", or "which customers have booked more than
  once" -> get_repeat_customers, in ONE call. Never answer this by calling get_customer_summary
  and then get_customer_history on every customer one by one — that's slow, wasteful, and this
  tool already does the ranking server-side.
- A general "catch me up" / daily status check about RETURNS and overdue rentals -> get_daily_briefing
- Looking up one specific booking by its code (e.g. BK-0001) -> get_booking_by_code`;

// POST /api/chat — body: { messages: Anthropic.MessageParam[] }
chatRouter.post("/", async (req, res) => {
  try {
    const messages: Anthropic.MessageParam[] = req.body.messages;

    let response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    // Resolve tool calls in a loop until Claude returns a final text answer.
    //
    // Every tool_use block MUST get a matching tool_result — Anthropic
    // rejects the next request outright ("tool_use ids were found without
    // tool_result blocks immediately after") if even one is missing. The
    // previous version awaited a plain Promise.all over runTool() calls: if
    // ANY one of them threw (a bad lookup, a transient DB error, or simply
    // the model asking a large batch of tool calls in one turn — e.g. it
    // tried resolving "who's our most repeated customer" by calling
    // get_customer_history once per customer instead of reaching for
    // get_repeat_customers), Promise.all rejected as a whole, the request
    // failed, and — because messages is the very array the frontend keeps
    // accumulating turn to turn — a follow-up message could still end up
    // built on top of that half-completed exchange, reproducing exactly
    // that 400 downstream. Each call is now isolated in its own try/catch:
    // a failing tool still produces a real tool_result (marked is_error, so
    // Claude sees the failure and can recover/apologize instead of the
    // whole turn silently vanishing), so toolResults.length always equals
    // toolUses.length no matter what any individual call does.
    let iterations = 0;
    const MAX_TOOL_ITERATIONS = 8;
    while (response.stop_reason === "tool_use") {
      iterations++;
      if (iterations > MAX_TOOL_ITERATIONS) {
        throw new Error("Assistant made too many tool calls in a row without finishing — please rephrase your question.");
      }

      const toolUses = response.content.filter((block) => block.type === "tool_use");
      const toolResults = await Promise.all(
        toolUses.map(async (block) => {
          try {
            const result = await runTool(block.name, block.input as Record<string, unknown>);
            return { type: "tool_result" as const, tool_use_id: block.id, content: JSON.stringify(result) };
          } catch (toolErr) {
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify({ error: toolErr instanceof Error ? toolErr.message : "Tool call failed" }),
              is_error: true,
            };
          }
        })
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

    res.json({ message: response });
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
