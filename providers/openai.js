/**
 * OpenAI provider - placeholder
 * 
 * This provider requires manual implementation with playwright-mcp-bridge.
 * See the right-code provider for an example of how to implement browser-based scraping.
 */

async function fetchUsage({ start, end, env }) {
  throw new Error(
    "OpenAI provider not implemented. " +
    "Please implement browser-based scraping similar to the right-code provider."
  );
}

module.exports = {
  providerId: "openai",
  fetchUsage,
};
