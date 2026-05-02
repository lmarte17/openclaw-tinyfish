import { parseConfig, pluginConfigSchema } from "./lib/config.js";
import { TfCliRunner } from "./lib/runner.js";
import { registerTools } from "./lib/tools.js";

const PLUGIN_ID = "openclaw-tinyfish";

export default {
  id: PLUGIN_ID,
  name: "OpenClaw TinyFish CLI",
  description:
    "Wraps the tinyfish-cli tool to expose browser automation operations as agent-callable tools. " +
    "Supports synchronous and asynchronous runs, run management, and concurrent fanout execution. " +
    "Auth via TINYFISH_API_KEY env var or plugin config.",
  kind: "runtime",

  configSchema: pluginConfigSchema,

  register(api) {
    const config = parseConfig(api.pluginConfig || {});

    function logger(level, message) {
      if (!config.debug && level === "debug") return;
      const sink = api?.logger?.[level] || api?.logger?.info || console.log;
      sink.call(api?.logger || console, message);
    }

    const runner = new TfCliRunner(config);

    registerTools(api, runner);

    // On startup: verify tinyfish is reachable and an API key is configured.
    // Logs a warning (not a hard failure) so the plugin loads even if credentials
    // aren't yet set up.
    api.registerService({
      id: PLUGIN_ID,
      start: async () => {
        const result = await runner.run(["auth", "status"]);
        if (result.ok && result.data?.authenticated) {
          logger("info", `${PLUGIN_ID}: authenticated via ${result.data.source}`);
        } else if (result.error?.code === "ENOENT") {
          logger("warn", `${PLUGIN_ID}: tinyfish not found at '${config.tfcliPath}' — install with: pip install tinyfish-cli`);
        } else if (!result.data?.authenticated) {
          logger("warn", `${PLUGIN_ID}: no API key configured — set TINYFISH_API_KEY or run: tinyfish auth login`);
        } else {
          logger("warn", `${PLUGIN_ID}: startup check returned [${result.error?.code}]: ${result.error?.message}`);
        }
      },
      stop: () => {}
    });

    logger("info", `${PLUGIN_ID}: registered (tfcliPath=${config.tfcliPath})`);
  }
};
