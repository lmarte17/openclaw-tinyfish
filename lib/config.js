/**
 * Config schema and parsing for openclaw-tinyfish.
 *
 * Auth resolution order (mirrors tinyfish-cli's own precedence):
 *   apiKey: config.apiKey → TINYFISH_API_KEY env → ~/.tinyfish/config.json
 *
 * The plugin only injects TINYFISH_API_KEY when explicitly configured —
 * if absent, tinyfish-cli picks it up from the environment or config file natively.
 */

export const pluginConfigSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    tfcliPath: {
      type: "string",
      description: "Path to the tinyfish executable (default: 'tinyfish'). Use if it is not on PATH."
    },
    apiKey: {
      type: "string",
      description: "TinyFish API key. Takes precedence over TINYFISH_API_KEY env var."
    },
    baseUrl: {
      type: "string",
      description: "TinyFish API base URL (default: 'https://agent.tinyfish.ai')."
    },
    timeout: {
      type: "number",
      description: "HTTP request timeout in seconds (default: 300)."
    },
    debug: {
      type: "boolean",
      description: "Log every tinyfish invocation for debugging."
    }
  }
};

export function parseConfig(raw = {}) {
  return {
    tfcliPath: str(raw.tfcliPath) || "tinyfish",
    apiKey:    str(raw.apiKey)    || null,
    baseUrl:   str(raw.baseUrl)   || null,
    timeout:   typeof raw.timeout === "number" && raw.timeout > 0 ? raw.timeout : null,
    debug:     raw.debug === true
  };
}

function str(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
