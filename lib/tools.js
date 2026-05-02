/**
 * Registers all tf_* tools against the OpenClaw plugin API.
 *
 * Tool inventory (8 total):
 *   Auth    : tf_status
 *   Run     : tf_run, tf_run_async
 *   Manage  : tf_runs_get, tf_runs_list, tf_runs_wait, tf_runs_cancel
 *   Fanout  : tf_fanout_run
 */

const BROWSER_PROFILES = ["lite", "stealth"];
const PROXY_COUNTRIES  = ["US", "GB", "CA", "DE", "FR", "JP", "AU"];
const RUN_STATUSES     = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"];

function textResult(text, details = {}) {
  return { content: [{ type: "text", text }], details };
}

function errResult(label, error) {
  return textResult(`${label}: [${error.code}] ${error.message}`, { error });
}

/**
 * Shared: build CLI args for the single-run options common to tf_run and tf_run_async.
 */
function singleRunArgs(params) {
  const args = [];
  if (params.url)              args.push("--url",              params.url);
  if (params.goal)             args.push("--goal",             params.goal);
  if (params.browser_profile)  args.push("--browser-profile",  params.browser_profile);
  if (params.api_integration)  args.push("--api-integration",  params.api_integration);
  if (params.proxy_enabled === true)  args.push("--proxy-enabled");
  if (params.proxy_enabled === false) args.push("--no-proxy-enabled");
  if (params.proxy_country)    args.push("--proxy-country",    params.proxy_country);
  if (params.enable_agent_memory === true)  args.push("--enable-agent-memory");
  if (params.enable_agent_memory === false) args.push("--no-enable-agent-memory");
  if (params.use_vault === true)  args.push("--use-vault");
  if (params.use_vault === false) args.push("--no-use-vault");
  if (Array.isArray(params.credential_item_ids)) {
    for (const id of params.credential_item_ids) args.push("--credential-item-id", id);
  }
  return args;
}

const singleRunProperties = {
  url:  { type: "string",  description: "Target URL for the browser automation" },
  goal: { type: "string",  description: "Natural-language goal for the automation" },
  browser_profile: {
    type: "string",
    enum: BROWSER_PROFILES,
    description: "Browser profile to use: 'lite' (default) or 'stealth' (anti-bot evasion)"
  },
  proxy_enabled: {
    type: "boolean",
    description: "Enable or disable proxy usage"
  },
  proxy_country: {
    type: "string",
    enum: PROXY_COUNTRIES,
    description: "Proxy country code (also enables proxy if proxy_enabled is not set)"
  },
  api_integration: {
    type: "string",
    description: "Integration label passed to TinyFish (e.g. 'openclaw')"
  },
  enable_agent_memory: {
    type: "boolean",
    description: "Enable or disable TinyFish agent memory for this run"
  },
  use_vault: {
    type: "boolean",
    description: "Enable or disable TinyFish vault credential injection"
  },
  credential_item_ids: {
    type: "array",
    items: { type: "string" },
    description: "Vault credential item IDs to inject (implies use_vault: true)"
  }
};

export function registerTools(api, runner) {

  // ─── Auth / status ───────────────────────────────────────────────────────

  api.registerTool({
    name: "tf_status",
    label: "TinyFish Auth Status",
    description: "Check TinyFish authentication status. Returns whether an API key is configured, its source (arg/env/config), and the config file path.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async execute() {
      const result = await runner.run(["auth", "status"]);
      // exit 1 when unauthenticated — still a valid response
      if (!result.ok && result.error?.code !== "MISSING_API_KEY") {
        return errResult("TinyFish status check failed", result.error);
      }
      const data = result.data || {};
      const authenticated = data.authenticated === true;
      return textResult(
        authenticated ? `Authenticated via ${data.source}` : "Not authenticated — set TINYFISH_API_KEY or run: tinyfish auth login",
        { status: data }
      );
    }
  }, { name: "tf_status" });

  // ─── Run operations ───────────────────────────────────────────────────────

  api.registerTool({
    name: "tf_run",
    label: "TinyFish Run (sync)",
    description: [
      "Execute a synchronous TinyFish browser automation and wait for the result.",
      "Blocks until the automation completes (up to the configured timeout, default 300 s).",
      "For longer jobs or when you want the run_id immediately, use tf_run_async instead.",
      "Returns the full TinyFish run response including status, result, and any error."
    ].join(" "),
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["url", "goal"],
      properties: singleRunProperties
    },
    async execute(_id, params) {
      const args = ["run", ...singleRunArgs(params)];
      const result = await runner.run(args);
      if (!result.ok) return errResult("TinyFish run failed", result.error);
      const status = result.data?.status || "COMPLETED";
      const runId  = result.data?.run_id  || result.data?.id || "unknown";
      return textResult(`Run ${runId} → ${status}`, { run: result.data });
    }
  }, { name: "tf_run" });

  api.registerTool({
    name: "tf_run_async",
    label: "TinyFish Run (async)",
    description: [
      "Start a TinyFish browser automation asynchronously and return immediately with a run_id.",
      "Use tf_runs_wait to poll until completion, or tf_runs_get to check status at any time.",
      "Prefer this over tf_run for long automations to avoid blocking the agent turn."
    ].join(" "),
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["url", "goal"],
      properties: singleRunProperties
    },
    async execute(_id, params) {
      const args = ["run-async", ...singleRunArgs(params)];
      const result = await runner.run(args);
      if (!result.ok) return errResult("TinyFish async run failed", result.error);
      const runId = result.data?.run_id || result.data?.id || "unknown";
      return textResult(`Started run ${runId} (async)`, { run: result.data });
    }
  }, { name: "tf_run_async" });

  // ─── Run management ───────────────────────────────────────────────────────

  api.registerTool({
    name: "tf_runs_get",
    label: "TinyFish Get Run",
    description: "Fetch the current state of a single TinyFish run by its run_id. Returns status, result, timestamps, and error (if any).",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["run_id"],
      properties: {
        run_id: { type: "string", description: "TinyFish run ID to retrieve" }
      }
    },
    async execute(_id, params) {
      const result = await runner.run(["runs", "get", params.run_id]);
      if (!result.ok) return errResult(`Failed to get run '${params.run_id}'`, result.error);
      const status = result.data?.status || "unknown";
      return textResult(`Run ${params.run_id} → ${status}`, { run: result.data });
    }
  }, { name: "tf_runs_get" });

  api.registerTool({
    name: "tf_runs_list",
    label: "TinyFish List Runs",
    description: "List and search TinyFish automation runs with optional filters. Returns paginated results.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        status:         { type: "string", enum: RUN_STATUSES, description: "Filter by run status" },
        goal:           { type: "string", description: "Filter by goal text (partial match)" },
        created_after:  { type: "string", description: "ISO 8601 datetime — return runs created after this time" },
        created_before: { type: "string", description: "ISO 8601 datetime — return runs created before this time" },
        sort_direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction (default: desc)" },
        cursor:         { type: "string", description: "Pagination cursor from a previous response" },
        limit:          { type: "number", description: "Maximum number of runs to return" }
      }
    },
    async execute(_id, params) {
      const args = ["runs", "list"];
      if (params.status)         args.push("--status",         params.status);
      if (params.goal)           args.push("--goal",           params.goal);
      if (params.created_after)  args.push("--created-after",  params.created_after);
      if (params.created_before) args.push("--created-before", params.created_before);
      if (params.sort_direction) args.push("--sort-direction", params.sort_direction);
      if (params.cursor)         args.push("--cursor",         params.cursor);
      if (params.limit != null)  args.push("--limit",          String(params.limit));

      const result = await runner.run(args);
      if (!result.ok) return errResult("Failed to list runs", result.error);
      const runs = result.data?.runs || result.data || [];
      const count = Array.isArray(runs) ? runs.length : "?";
      return textResult(`${count} run(s) returned`, { data: result.data });
    }
  }, { name: "tf_runs_list" });

  api.registerTool({
    name: "tf_runs_wait",
    label: "TinyFish Wait for Run",
    description: [
      "Poll a TinyFish run until it reaches a terminal status (COMPLETED, FAILED, or CANCELLED).",
      "Use after tf_run_async to block until the automation finishes.",
      "Returns the final run response when terminal status is reached."
    ].join(" "),
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["run_id"],
      properties: {
        run_id:       { type: "string", description: "TinyFish run ID to wait for" },
        interval:     { type: "number", description: "Polling interval in seconds (default: 2.0)" },
        wait_timeout: { type: "number", description: "Maximum wait time in seconds (default: 300.0)" }
      }
    },
    async execute(_id, params) {
      const args = ["runs", "wait", params.run_id];
      if (params.interval     != null) args.push("--interval",     String(params.interval));
      if (params.wait_timeout != null) args.push("--wait-timeout", String(params.wait_timeout));

      const result = await runner.run(args);
      if (!result.ok) return errResult(`Wait failed for run '${params.run_id}'`, result.error);
      const status = result.data?.status || "COMPLETED";
      return textResult(`Run ${params.run_id} reached ${status}`, { run: result.data });
    }
  }, { name: "tf_runs_wait" });

  api.registerTool({
    name: "tf_runs_cancel",
    label: "TinyFish Cancel Run",
    description: "Cancel an active TinyFish run by its run_id. Has no effect on already-terminal runs.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["run_id"],
      properties: {
        run_id: { type: "string", description: "TinyFish run ID to cancel" }
      }
    },
    async execute(_id, params) {
      const result = await runner.run(["runs", "cancel", params.run_id]);
      if (!result.ok) return errResult(`Failed to cancel run '${params.run_id}'`, result.error);
      return textResult(`Run ${params.run_id} cancelled`, { run: result.data });
    }
  }, { name: "tf_runs_cancel" });

  // ─── Fanout ───────────────────────────────────────────────────────────────

  api.registerTool({
    name: "tf_fanout_run",
    label: "TinyFish Fanout Run",
    description: [
      "Execute multiple TinyFish browser automations concurrently from a fanout plan.",
      "Each task in the plan has an 'id', a 'request' object ({ url, goal, ... }), and optional overrides.",
      "Results include per-task status and full run responses.",
      "Input schema: { name?: string, request_defaults?: object, tasks: [{ id, request }] }"
    ].join(" "),
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["plan"],
      properties: {
        plan: {
          type: "object",
          description: "Fanout plan object: { name?, request_defaults?, tasks: [{ id, request: { url, goal, ... } }] }"
        },
        task_ids: {
          type: "array",
          items: { type: "string" },
          description: "Subset of task IDs to run (default: all tasks in the plan)"
        },
        max_concurrency: {
          type: "number",
          description: "Maximum number of simultaneous TinyFish runs (default: 5)"
        },
        interval: {
          type: "number",
          description: "Polling interval in seconds (default: 2.0)"
        },
        wait_timeout: {
          type: "number",
          description: "Maximum wait time per task in seconds (default: 300.0)"
        },
        fail_fast: {
          type: "boolean",
          description: "Stop starting new tasks after the first failure (default: false)"
        }
      }
    },
    async execute(_id, params) {
      const args = ["fanout", "run", "--input", "-"];
      if (Array.isArray(params.task_ids)) {
        for (const tid of params.task_ids) args.push("--task", tid);
      }
      if (params.max_concurrency != null) args.push("--max-concurrency", String(params.max_concurrency));
      if (params.interval        != null) args.push("--interval",        String(params.interval));
      if (params.wait_timeout    != null) args.push("--wait-timeout",    String(params.wait_timeout));
      if (params.fail_fast)               args.push("--fail-fast");

      const result = await runner.run(args, { stdinData: params.plan });
      if (!result.ok) return errResult("Fanout run failed", result.error);

      const tasks   = result.data?.tasks   || [];
      const passed  = tasks.filter(t => t.status === "COMPLETED").length;
      const failed  = tasks.filter(t => t.status === "FAILED").length;
      const total   = tasks.length;
      return textResult(`Fanout: ${passed}/${total} completed, ${failed} failed`, { data: result.data });
    }
  }, { name: "tf_fanout_run" });
}
