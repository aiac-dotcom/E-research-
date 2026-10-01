import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/** True when an Anthropic key is configured. AI features are optional services. */
export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY);
}

/**
 * Lazily created client so the platform can start without AI configured;
 * routes that need AI check isAnthropicConfigured() first.
 */
export function getAnthropic(): Anthropic {
  if (!client) {
    if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
      throw new Error("AI_INTEGRATIONS_ANTHROPIC_API_KEY is not set; AI analysis is unavailable.");
    }
    client = new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    });
  }
  return client;
}

export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop) {
    return Reflect.get(getAnthropic(), prop);
  },
});
