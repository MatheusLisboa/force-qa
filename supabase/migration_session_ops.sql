-- ForceQA — inbox, anexos, duplicata, checklist, webhook
-- Rode no SQL Editor depois de migration_security_hardening.sql.

ALTER TABLE public.bugs
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.bugs
  ADD COLUMN IF NOT EXISTS duplicate_of_bug_id TEXT;

ALTER TABLE public.bugs
  ADD COLUMN IF NOT EXISTS repro_checklist JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.bugs
SET attachments =
  (CASE
    WHEN evidence_url IS NOT NULL AND evidence_url ~* '^https://'
      THEN jsonb_build_array(jsonb_build_object('id', 'legacy-evidence', 'url', evidence_url, 'kind', 'file'))
    ELSE '[]'::jsonb
  END)
  ||
  (CASE
    WHEN prototype_url IS NOT NULL AND prototype_url ~* '^https://'
      THEN jsonb_build_array(jsonb_build_object('id', 'legacy-prototype', 'url', prototype_url, 'kind', 'prototype'))
    ELSE '[]'::jsonb
  END)
WHERE attachments = '[]'::jsonb
  AND (
    (evidence_url IS NOT NULL AND evidence_url ~* '^https://')
    OR (prototype_url IS NOT NULL AND prototype_url ~* '^https://')
  );

CREATE TABLE IF NOT EXISTS public.organization_integrations (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  webhook_url TEXT CHECK (webhook_url IS NULL OR webhook_url ~* '^https://'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_integrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_integrations FROM PUBLIC;
REVOKE ALL ON TABLE public.organization_integrations FROM anon;
REVOKE ALL ON TABLE public.organization_integrations FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_bugs_owner_open
  ON public.bugs (owner_id)
  WHERE archived = false AND status <> 'validated';

CREATE INDEX IF NOT EXISTS idx_bugs_duplicate_of
  ON public.bugs (duplicate_of_bug_id)
  WHERE duplicate_of_bug_id IS NOT NULL;

COMMENT ON COLUMN public.bugs.attachments IS 'Lista {id,url,kind} de evidências; evidence_url continua como atalho do primeiro arquivo.';
COMMENT ON COLUMN public.bugs.duplicate_of_bug_id IS 'Card original quando este é duplicata.';
COMMENT ON COLUMN public.bugs.repro_checklist IS 'Checklist de reprodução [{id,text,done}].';
COMMENT ON TABLE public.organization_integrations IS 'Webhook Slack/Discord da org; só o service_role lê. Sem policy de authenticated.';
