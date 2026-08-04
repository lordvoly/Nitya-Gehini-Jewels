import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { runTool, toolDefinitions } from "../tools/index.js";

export const chatRouter = Router();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the assistant for Nitya Gehini Jewels, a jewelry rental and sales shop.
Answer using the provided tools only — never guess or invent an item's location, price, or
availability. If a tool call returns nothing, say so plainly.`;

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
    while (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter((block) => block.type === "tool_use");
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

    res.json({ message: response });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});
