/**
 * Logger central. Em produção emite uma linha JSON por evento (fácil de filtrar
 * nos logs da Vercel); em dev imprime legível. Segredos são mascarados.
 */

type Level = "debug" | "info" | "warn" | "error";

const SECRET_KEY = /authorization|token|secret|password|api[-_]?key|cookie|service_role/i;

export function redact(value: unknown, depth = 0): unknown {
  if (value == null || depth > 4) return value;
  if (typeof value === "string") {
    return value.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]");
  }
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message), status: (value as { status?: unknown }).status };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? "[redacted]" : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

export function formatLog(level: Level, args: unknown[]): { level: Level; message: string; details?: unknown[] } {
  const [first, ...rest] = args;
  const message = typeof first === "string" ? first : first instanceof Error ? first.message : "log";
  const details = (typeof first === "string" ? rest : args).map((item) => redact(item));
  return details.length ? { level, message: String(redact(message)), details } : { level, message: String(redact(message)) };
}

function emit(level: Level, args: unknown[]) {
  const entry = formatLog(level, args);
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (process.env.NODE_ENV === "production") {
    sink(JSON.stringify({ ...entry, ts: new Date().toISOString() }));
  } else {
    sink(`[${level}] ${entry.message}`, ...(entry.details ?? []));
  }
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== "production") emit("debug", args);
  },
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};
