# OpenClaw TinyFish CLI

OpenClaw runtime plugin that wraps [`tinyfish-cli`](https://github.com/lmarte17/tf-cli) and exposes browser automation as agent-callable tools.

The plugin translates OpenClaw tool calls into TinyFish CLI commands, parses JSON responses, and returns structured run data to the agent.

## What it does

- Checks TinyFish authentication status.
- Runs synchronous browser automations.
- Starts asynchronous browser automations.
- Fetches, lists, waits for, and cancels TinyFish runs.
- Executes fanout browser automation plans with bounded concurrency.
- Supports browser profiles, proxies, vault credentials, API integration labels, and TinyFish agent memory options.

## Tools

All tools use the `tf_` prefix.

- Auth: `tf_status`
- Run: `tf_run`, `tf_run_async`
- Run management: `tf_runs_get`, `tf_runs_list`, `tf_runs_wait`, `tf_runs_cancel`
- Fanout: `tf_fanout_run`

See [SKILL.md](./SKILL.md) for full parameter examples.

## Requirements

Install the underlying CLI where OpenClaw can find it:

```bash
pip install tinyfish-cli
```

If the binary is not on `PATH`, set `tfcliPath` in plugin config.

## Authentication

The plugin can inject an API key from config, or TinyFish can resolve auth from environment/config itself.

Common environment setup:

```bash
export TINYFISH_API_KEY="..."
```

Alternatively, use the CLI login flow:

```bash
tinyfish auth login
```

Plugin config keys:

- `tfcliPath`
- `apiKey`
- `baseUrl`
- `timeout`
- `debug`

## Startup behavior

On startup, the plugin runs `tinyfish auth status`. If TinyFish is missing or unauthenticated, the plugin logs a warning but still loads.

## Typical flow

For short browser tasks:

```text
tf_status
tf_run
```

For longer tasks:

```text
tf_run_async
tf_runs_wait
```

For parallel research or extraction:

```text
tf_fanout_run
```

## Development

```bash
npm run check
```

