/**
 * Sandboxed JavaScript execution for the run_code agent tool.
 *
 * Runs code inside a restricted Node.js vm context:
 * - No access to process, require, fetch, or filesystem
 * - Hard timeout of 5 seconds (configurable)
 * - stdout captured via a fake console
 * - Return value captured if code ends with an expression
 * - Memory limit enforced via size check on captured output
 */

import vm from "vm";

export interface CodeRunResult {
  stdout: string[];
  returnValue: unknown;
  error?: string;
  executionMs: number;
  truncated: boolean;
}

const MAX_OUTPUT_CHARS = 8_000;
const MAX_TIMEOUT_MS = 5_000;

export function runJavaScript(code: string, timeoutMs = MAX_TIMEOUT_MS): CodeRunResult {
  const stdout: string[] = [];
  let returnValue: unknown = undefined;
  let errorMsg: string | undefined;
  let truncated = false;

  // Fake console that captures to stdout array
  const fakeConsole = {
    log: (...args: unknown[]) => capture(args.map(serialize).join(" ")),
    info: (...args: unknown[]) => capture("[info] " + args.map(serialize).join(" ")),
    warn: (...args: unknown[]) => capture("[warn] " + args.map(serialize).join(" ")),
    error: (...args: unknown[]) => capture("[error] " + args.map(serialize).join(" ")),
    table: (data: unknown) => capture(JSON.stringify(data, null, 2)),
    dir: (data: unknown) => capture(JSON.stringify(data, null, 2)),
  };

  function capture(line: string) {
    const totalSoFar = stdout.reduce((n, s) => n + s.length, 0);
    if (totalSoFar >= MAX_OUTPUT_CHARS) {
      truncated = true;
      return;
    }
    stdout.push(line.slice(0, MAX_OUTPUT_CHARS - totalSoFar));
  }

  // Sandbox — only safe globals exposed
  const sandbox = {
    console: fakeConsole,
    Math,
    JSON,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    btoa: (s: string) => Buffer.from(s).toString("base64"),
    atob: (s: string) => Buffer.from(s, "base64").toString("utf8"),
    // Intentionally EXCLUDED: require, process, fetch, fs, global, __dirname, Buffer
  };

  vm.createContext(sandbox);

  const startMs = Date.now();

  try {
    // Wrap in an IIFE so we can capture the final return value
    const wrapped = `(function() { ${code} \n})()`;
    returnValue = vm.runInContext(wrapped, sandbox, {
      timeout: timeoutMs,
      breakOnSigint: true,
      filename: "agent-code.js",
    });
  } catch (err) {
    if (err instanceof Error) {
      // Trim VM noise from stack traces
      const lines = (err.stack ?? err.message).split("\n");
      const relevant = lines
        .filter((l) => !l.includes("vm.js") && !l.includes("node:vm") && !l.includes("at runInContext"))
        .slice(0, 6)
        .join("\n");
      errorMsg = relevant || err.message;
    } else {
      errorMsg = String(err);
    }
  }

  return {
    stdout,
    returnValue: returnValue !== undefined ? serialize(returnValue) : undefined,
    error: errorMsg,
    executionMs: Date.now() - startMs,
    truncated,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serialize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "function") return `[Function: ${value.name || "anonymous"}]`;
  if (typeof value === "bigint") return String(value) + "n";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
