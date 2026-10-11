-- ForceQA — rate limit compartilhado entre instâncias serverless.
-- Antes cada instância da Vercel contava sozinha (Map em memória), então o limite
-- efetivo era N vezes maior. Aqui o contador fica no Postgres, atômico.
-- O código cai para memória se esta função ainda não existir (nada quebra).

BEGIN;

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits         integer NOT NULL DEFAULT 0
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
-- Sem policies de propósito: só o service_role (API) acessa.
REVOKE ALL ON public.api_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hits integer;
BEGIN
  INSERT INTO public.api_rate_limits AS r (key, window_start, hits)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    window_start = CASE
      WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN now()
      ELSE r.window_start
    END,
    hits = CASE
      WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN 1
      ELSE r.hits + 1
    END
  RETURNING hits INTO v_hits;

  -- Faxina ocasional de chaves antigas.
  IF random() < 0.01 THEN
    DELETE FROM public.api_rate_limits WHERE window_start < now() - interval '1 day';
  END IF;

  RETURN v_hits <= p_max;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

COMMIT;
