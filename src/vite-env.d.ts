/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Opcional: ativa o envio de erros ao Sentry. */
  readonly VITE_SENTRY_DSN?: string;
  /** "1" habilita a vitrine /design fora do modo dev (usado nos e2e). */
  readonly VITE_DESIGN_PAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
