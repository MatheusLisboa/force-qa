import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";

export interface RateLimitRule {
  windowMs: number;
  max: number;
  message: string;
}

/** Janela deslizante em memória: fallback e base dos testes. */
export function createMemoryLimiter(now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return {
    /** Registra uma chamada; devolve false se estourou o limite. */
    hit(key: string, rule: Pick<RateLimitRule, "windowMs" | "max">): boolean {
      const t = now();
      const recent = (hits.get(key) || []).filter((stamp) => t - stamp < rule.windowMs);
      if (recent.length >= rule.max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      return true;
    },
    clear: () => hits.clear(),
  };
}

const memory = createMemoryLimiter();
let warnedFallback = false;

/**
 * Conta uma chamada em `scope:id`. Usa o contador do Postgres (compartilhado entre
 * instâncias); se a função SQL não existir ou falhar, cai para memória.
 * Lança 429 quando passa do limite.
 */
export async function enforceRateLimit(
  admin: Pick<SupabaseClient, "rpc"> | null,
  scope: string,
  id: string,
  rule: RateLimitRule
): Promise<void> {
  const key = `${scope}:${id}`;
  let allowed: boolean | null = null;

  if (admin) {
    try {
      const { data, error } = await admin.rpc("consume_rate_limit", {
        p_key: key,
        p_window_seconds: Math.max(1, Math.ceil(rule.windowMs / 1000)),
        p_max: rule.max,
      });
      if (!error && typeof data === "boolean") allowed = data;
      else if (!warnedFallback) {
        warnedFallback = true;
        logger.warn("rate limit: consume_rate_limit indisponível, usando memória (rode supabase/migrations/20260101000020_rate_limits.sql)", error);
      }
    } catch (error) {
      if (!warnedFallback) {
        warnedFallback = true;
        logger.warn("rate limit: falha ao consultar o banco, usando memória", error);
      }
    }
  }

  if (allowed === null) allowed = memory.hit(key, rule);
  if (!allowed) throw Object.assign(new Error(rule.message), { status: 429 });
}

/** IP do cliente atrás de proxy (Vercel). */
export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const forwarded = headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(",")[0]?.trim();
  if (first) return first;
  const real = headers["x-real-ip"];
  return (Array.isArray(real) ? real[0] : real) || "unknown";
}
