-- ForceQA — token de extração (GitLab e similares leem o board via GET)
-- Rode no SQL Editor depois de migration_session_ops.sql.
-- O token em si nunca é gravado: só o SHA-256 e um prefixo para a UI.

ALTER TABLE public.organization_integrations
  ADD COLUMN IF NOT EXISTS export_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS export_token_prefix TEXT,
  ADD COLUMN IF NOT EXISTS export_token_created_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_integrations_export_token_hash
  ON public.organization_integrations (export_token_hash)
  WHERE export_token_hash IS NOT NULL;

COMMENT ON COLUMN public.organization_integrations.export_token_hash IS
  'SHA-256 hex do token fqex_…; o plaintext só aparece uma vez na UI.';
COMMENT ON COLUMN public.organization_integrations.export_token_prefix IS
  'Primeiros caracteres do token, só para o admin reconhecer qual chave está ativa.';
COMMENT ON TABLE public.organization_integrations IS
  'Webhook Slack/Discord e token de extração da org; só o service_role lê.';
