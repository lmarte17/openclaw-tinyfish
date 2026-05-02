import { spawn } from "node:child_process";

export class TfCliRunner {
  constructor(config) {
    this.tfcliPath = config.tfcliPath || "tinyfish";
    this.apiKey    = config.apiKey    || null;
    this.baseUrl   = config.baseUrl   || null;
    this.timeout   = config.timeout   || null;
    this.debug     = config.debug === true;
  }

  /**
   * Build environment for the subprocess.
   * Only injects TINYFISH_API_KEY when explicitly configured —
   * if not set, tinyfish-cli picks it up from its own env/config natively.
   */
  _buildEnv() {
    const env = { ...process.env };
    if (this.apiKey) env.TINYFISH_API_KEY = this.apiKey;
    return env;
  }

  /**
   * Global flags that precede every subcommand.
   * tinyfish outputs JSON by default — no --format flag needed.
   */
  _buildGlobalArgs() {
    const args = [];
    if (this.baseUrl)       args.push("--base-url", this.baseUrl);
    if (this.timeout != null) args.push("--timeout", String(this.timeout));
    return args;
  }

  /**
   * Run a tinyfish command.
   *
   * @param {string[]} cmdArgs   - subcommand + its own args, e.g. ["runs", "get", "<id>"]
   * @param {object}   [opts]
   * @param {string|object} [opts.stdinData] - if set, written to the process stdin (for --input -)
   * @returns {{ ok: boolean, data?: any, stderr?: string, error?: { type, code, message, details? } }}
   */
  async run(cmdArgs, { stdinData = null } = {}) {
    const allArgs = [...this._buildGlobalArgs(), ...cmdArgs];
    const env = this._buildEnv();

    if (this.debug) {
      console.log(`[openclaw-tinyfish] exec: ${this.tfcliPath} ${allArgs.map(a => JSON.stringify(a)).join(" ")}`);
    }

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";

      const proc = spawn(this.tfcliPath, allArgs, {
        env,
        stdio: [stdinData != null ? "pipe" : "ignore", "pipe", "pipe"]
      });

      if (stdinData != null) {
        const input = typeof stdinData === "string" ? stdinData : JSON.stringify(stdinData);
        proc.stdin.write(input);
        proc.stdin.end();
      }

      proc.stdout.on("data", chunk => { stdout += chunk; });
      proc.stderr.on("data", chunk => { stderr += chunk; });

      proc.on("error", err => {
        if (err.code === "ENOENT") {
          resolve({
            ok: false,
            error: {
              type: "NotFoundError",
              code: "ENOENT",
              message: `tinyfish not found at '${this.tfcliPath}'. Install with: pip install tinyfish-cli`
            }
          });
        } else {
          resolve({ ok: false, error: { type: "SpawnError", code: "SPAWN_ERROR", message: err.message } });
        }
      });

      proc.on("close", (code) => {
        if (code === 0) {
          const raw = stdout.trim();
          let data;
          try {
            data = JSON.parse(raw || "null");
          } catch {
            data = raw;
          }
          resolve({ ok: true, data, stderr: stderr.trim() || null });
        } else {
          // tinyfish emits structured error JSON to stderr: { error: { code, message, details? } }
          let errorPayload = null;
          try {
            const parsed = JSON.parse(stderr.trim());
            if (parsed?.error) errorPayload = parsed.error;
          } catch { /* ignore */ }

          const message = errorPayload?.message
            || stderr.trim()
            || stdout.trim()
            || `tinyfish exited with code ${code}`;
          const errorCode = errorPayload?.code || "CLI_ERROR";

          resolve({
            ok: false,
            error: {
              type: "TinyFishError",
              code: errorCode,
              message,
              details: errorPayload?.details || null
            }
          });
        }
      });
    });
  }
}
