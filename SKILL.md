# tinyfish Skill

Wraps [tinyfish-cli](https://github.com/lmarte17/tf-cli) — a browser automation CLI — as agent-callable tools.

All tools use the `tf_` prefix. Auth is resolved from `TINYFISH_API_KEY` env var or plugin config. Output is always parsed JSON.

---

## Authentication

The plugin injects credentials into every subprocess call. Resolution order:

| Credential | Plugin config key | Env var fallback | File fallback |
|------------|-------------------|-----------------|---------------|
| API key | `apiKey` | `TINYFISH_API_KEY` | `~/.tinyfish/config.json` |

Run `tf_status` to confirm auth before issuing automations. If unauthenticated, the API key must be set via env var or `tinyfish auth login` (interactive CLI).

---

## Startup check

On plugin load, `tinyfish auth status` is called automatically. If unauthenticated or the binary is missing, the plugin still loads but automation tools will fail until auth is configured.

---

## Run lifecycle

```
tf_run_async  →  run created (PENDING)
                     ↓
              RUNNING (browser executing)
                     ↓
         COMPLETED / FAILED / CANCELLED
```

- **`tf_run`** — synchronous: blocks until terminal status. Use for short tasks or when the result is needed immediately.
- **`tf_run_async`** + **`tf_runs_wait`** — async: returns `run_id` immediately, then poll for completion. Prefer for long automations.
- **`tf_fanout_run`** — concurrent: run many tasks in parallel with bounded concurrency from a single plan object.

---

## Tool reference

### Auth

#### `tf_status`
Check whether a TinyFish API key is configured and where it came from (`arg`, `env`, or `config`).

```json
{}
```

Call this first when troubleshooting auth failures.

---

### Run

#### `tf_run`
Execute a synchronous TinyFish browser automation. Blocks until complete (up to `timeout` seconds, default 300).

```json
{
  "url": "https://example.com",
  "goal": "Return the page title as JSON: {\"title\": \"...\"}"
}
```

```json
{
  "url": "https://store.example.com/product/123",
  "goal": "Extract product name, price, and availability as JSON",
  "browser_profile": "stealth"
}
```

Returns the full TinyFish run response including `status`, `result`, and `error` (if failed).

**Key options:**

| Option | Type | Purpose |
|--------|------|---------|
| `url` | string | Target URL **(required)** |
| `goal` | string | Natural-language automation goal **(required)** |
| `browser_profile` | `"lite"` \| `"stealth"` | `stealth` enables anti-bot evasion headers and fingerprinting |
| `proxy_enabled` | boolean | Enable proxy routing |
| `proxy_country` | string | Proxy exit country: `US`, `GB`, `CA`, `DE`, `FR`, `JP`, `AU` |
| `api_integration` | string | Integration label passed to TinyFish (e.g. `"openclaw"`) |
| `enable_agent_memory` | boolean | Enable TinyFish agent memory across runs |
| `use_vault` | boolean | Inject vault credentials into the browser session |
| `credential_item_ids` | array | Vault credential item IDs to inject (implies `use_vault: true`) |

---

#### `tf_run_async`
Start a browser automation and return immediately with a `run_id`. Use `tf_runs_wait` to block until complete, or `tf_runs_get` to poll manually.

```json
{
  "url": "https://example.com",
  "goal": "Fill out and submit the contact form with test data"
}
```

Returns `{ run_id, status: "PENDING", ... }`. Takes the same options as `tf_run`.

---

### Run management

#### `tf_runs_get`
Fetch the current state of a run.

```json
{ "run_id": "run_abc123" }
```

Returns `{ run_id, status, result, error, started_at, finished_at, ... }`.

---

#### `tf_runs_list`
List and filter runs.

```json
{ "status": "COMPLETED", "limit": 20 }
```

```json
{ "goal": "contact form", "sort_direction": "desc" }
```

**Filters:**

| Option | Type | Purpose |
|--------|------|---------|
| `status` | string | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `goal` | string | Partial match against goal text |
| `created_after` | string | ISO 8601 datetime lower bound |
| `created_before` | string | ISO 8601 datetime upper bound |
| `sort_direction` | string | `asc` or `desc` (default: `desc`) |
| `cursor` | string | Pagination cursor from previous response |
| `limit` | number | Max results to return |

---

#### `tf_runs_wait`
Poll a run until it reaches a terminal status (`COMPLETED`, `FAILED`, or `CANCELLED`).

```json
{ "run_id": "run_abc123" }
```

```json
{ "run_id": "run_abc123", "wait_timeout": 120, "interval": 3 }
```

Returns the final run response. Fails with `WAIT_TIMEOUT` if the deadline is exceeded.

---

#### `tf_runs_cancel`
Cancel an active run. No-op on already-terminal runs.

```json
{ "run_id": "run_abc123" }
```

---

### Fanout

#### `tf_fanout_run`
Run multiple browser automations concurrently from a single plan object. Tasks are dispatched up to `max_concurrency` at a time and polled until all reach terminal status.

```json
{
  "plan": {
    "name": "Product research",
    "request_defaults": { "browser_profile": "stealth" },
    "tasks": [
      { "id": "product-a", "request": { "url": "https://shop.com/a", "goal": "Extract name and price as JSON" } },
      { "id": "product-b", "request": { "url": "https://shop.com/b", "goal": "Extract name and price as JSON" } },
      { "id": "product-c", "request": { "url": "https://shop.com/c", "goal": "Extract name and price as JSON" } }
    ]
  },
  "max_concurrency": 3
}
```

**Plan schema:**

```json
{
  "name": "optional label",
  "request_defaults": { "browser_profile": "lite" },
  "tasks": [
    {
      "id": "unique-task-id",
      "request": {
        "url": "https://...",
        "goal": "..."
      }
    }
  ]
}
```

`request_defaults` merges into every task's `request` — use for shared options like `browser_profile` or `api_integration`.

**Options:**

| Option | Type | Purpose |
|--------|------|---------|
| `plan` | object | Fanout plan **(required)** |
| `task_ids` | array | Run only this subset of tasks |
| `max_concurrency` | number | Max simultaneous runs (default: 5) |
| `interval` | number | Polling interval in seconds (default: 2.0) |
| `wait_timeout` | number | Max wait per task in seconds (default: 300.0) |
| `fail_fast` | boolean | Stop launching new tasks after the first failure |

Returns `{ tasks: [{ id, status, run_id, response }], ... }` with per-task results.

---

## Common workflows

### Single automation, block for result

```
1. tf_status          → confirm auth
2. tf_run             → execute and wait
3. read result        → result.run.result contains the extracted data
```

### Long automation, non-blocking

```
1. tf_run_async       → get run_id
2. [do other work]
3. tf_runs_wait       → block until terminal
4. tf_runs_get        → read final result (if wait returned it, skip this)
```

### Parallel research across many URLs

```
1. tf_fanout_run      → submit plan with N tasks
2. read per-task results from response.data.tasks
```

### Check and cancel a stuck run

```
1. tf_runs_list  status="RUNNING"    → find long-running runs
2. tf_runs_get   run_id=<id>         → inspect goal and elapsed time
3. tf_runs_cancel run_id=<id>        → cancel if stale
```

---

## Structuring goals for reliable extraction

TinyFish uses a natural-language goal to drive the browser agent. For structured data extraction:

- Be explicit about the output format: `"Return JSON only: { \"price\": \"...\", \"in_stock\": true }"`
- Avoid ambiguous verbs — prefer "extract", "return", "find" over "check" or "look at"
- For forms: describe the fields and values explicitly — `"Fill the 'Name' field with 'Test User' and click Submit"`
- For multi-step flows: enumerate steps — `"1. Click Login. 2. Enter email test@example.com. 3. Enter password abc123. 4. Click Sign in. 5. Return the dashboard header text."`

---

## Error handling

All `tf_*` tools return `details.error` on failure with:

```json
{
  "type": "TinyFishError",
  "code": "MISSING_API_KEY",
  "message": "TinyFish API key not found...",
  "details": {}
}
```

| Code | Meaning | Recovery |
|------|---------|----------|
| `MISSING_API_KEY` | No API key configured | Set `TINYFISH_API_KEY` env var |
| `ENOENT` | tinyfish binary not found | `pip install tinyfish-cli` |
| `RUN_FAILED` | Automation completed with FAILED status | Inspect `run.error`; retry with adjusted goal or `stealth` profile |
| `WAIT_TIMEOUT` | `tf_runs_wait` deadline exceeded | Increase `wait_timeout`, or cancel and retry |
| `NETWORK_ERROR` | Can't reach TinyFish API | Check connectivity to `agent.tinyfish.ai` |
| `INVALID_INPUT` | Missing `url` or `goal`, or bad fanout plan | Fix the input parameters |

On `RUN_FAILED`, inspect `details.run.error` — it contains the automation-level failure reason from TinyFish.

---

## Tips

- Use `tf_run_async` + `tf_runs_wait` for anything that might take over 30 seconds — it keeps the agent turn responsive.
- Use `browser_profile: "stealth"` when the target site has bot detection (Cloudflare, reCAPTCHA, Akamai).
- `tf_fanout_run` with `max_concurrency: 1` is a safe sequential batch — useful when sites rate-limit by IP.
- Always include the expected JSON shape in the goal — TinyFish's agent produces more reliable output when the schema is explicit.
- `tf_runs_list` with `status: "FAILED"` is useful for debugging a batch after a fanout run.
