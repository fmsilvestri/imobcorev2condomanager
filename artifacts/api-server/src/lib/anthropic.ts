import Anthropic from "@anthropic-ai/sdk";

const hasProxy =
  process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL &&
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

export const anthropic = hasProxy
  ? new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY!,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    })
  : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });
