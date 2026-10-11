/**
 * Logger do navegador. Imprime no console e, se VITE_SENTRY_DSN estiver definido,
 * envia erros ao Sentry (carregado sob demanda: sem DSN, nada é baixado).
 */

type SentryLike = {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
};

let sentry: SentryLike | null = null;
let sentryStarted = false;

function startSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (sentryStarted || !dsn) return;
  sentryStarted = true;
  import("@sentry/browser")
    .then((mod) => {
      mod.init({
        dsn,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0,
      });
      sentry = mod as unknown as SentryLike;
    })
    .catch(() => {
      sentryStarted = false;
    });
}

export function initLogger() {
  startSentry();
  window.addEventListener("error", (event) => logger.error("window.onerror", event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => logger.error("unhandledrejection", event.reason));
}

function firstError(args: unknown[]): unknown {
  return args.find((arg) => arg instanceof Error) ?? args[args.length - 1];
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.debug(...args);
  },
  info: (...args: unknown[]) => console.info(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => {
    console.error(...args);
    sentry?.captureException(firstError(args), { extra: { message: typeof args[0] === "string" ? args[0] : undefined } });
  },
};
