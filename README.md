# ForceQA

Plataforma de gestão colaborativa de bugs em sessões de QA e boards permanentes.

## Stack

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS
- **Backend:** Supabase (Auth + PostgreSQL + Realtime)
- **IA:** Gemini (sugestão/duplicata) com fallback OpenRouter; relatório executivo via OpenRouter/Ollama

## Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar Supabase

1. Acesse o [Dashboard Supabase](https://supabase.com/dashboard/project/bdvpzgrgwgcvfgflelbn)
2. Em **SQL Editor**, siga a ordem em [`supabase/00_run_order.sql`](supabase/00_run_order.sql). Em um banco já existente, rode [`supabase/migration_access_and_security.sql`](supabase/migration_access_and_security.sql) e [`supabase/migration_room_access_ui.sql`](supabase/migration_room_access_ui.sql)
3. Em **Authentication → Providers**, habilite **Email** e desative **Confirm email** (para login imediato em dev)
4. Em **Project Settings → API**, copie:
   - `anon` `public` key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` com suas chaves:

```env
VITE_SUPABASE_URL=https://bdvpzgrgwgcvfgflelbn.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
GEMINI_API_KEY=sua_gemini_key       # opcional
OPENROUTER_API_KEY=sua_openrouter   # sugestões, duplicata e relatório
```

### 4. Rodar localmente

```bash
npm run dev
```

Acesse `http://localhost:3000`

## Primeiro acesso

1. Cadastre-se na tela de login
2. Para virar **admin**, atualize o campo `role` para `admin` na tabela `users` no Supabase (Table Editor)
3. Admins podem criar usuários pelo painel do Dashboard

## Deploy na Vercel

O app é um **SPA estático** (Vite). Login e cadastro usam Supabase **direto no browser** — não precisa do Express na Vercel.

### Variáveis obrigatórias (Settings → Environment Variables)

| Nome | Onde usar |
|------|-----------|
| `VITE_SUPABASE_URL` | **Production** (e Preview se quiser) |
| `VITE_SUPABASE_ANON_KEY` | **Production** |
| `SUPABASE_SERVICE_ROLE_KEY` | **Production** (join, convite, admin, APIs) |
| `OPENROUTER_API_KEY` | **Production** (IA; `GEMINI_API_KEY` também serve para sugestão/duplicata) |

**Importante:** o prefixo `VITE_` é obrigatório. `SUPABASE_URL` sem `VITE_` **não funciona** no frontend.

Depois de adicionar ou alterar variáveis, faça **Redeploy** (Deployments → ⋯ → Redeploy). O Vite grava as vars no momento do **build**, não em runtime.

### Supabase → Authentication → URL Configuration

Adicione o domínio da Vercel:

- **Site URL:** `https://seu-app.vercel.app`
- **Redirect URLs:** `https://seu-app.vercel.app/**`

### Supabase → Authentication → Email

- Habilite **Email / Password**
- Desative **Confirm email** (recomendado para login imediato)

As rotas `/api/*` na Vercel são funções serverless. Defina `SUPABASE_SERVICE_ROLE_KEY` e `OPENROUTER_API_KEY` (ou `GEMINI_API_KEY`) no ambiente de produção.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor Express + Vite (porta 3000) |
| `npm run build` | Build completo (web + server local) |
| `npm run build:vercel` | Build só do frontend (usado pelo `vercel.json`) |
| `npm run lint` | Verificação TypeScript |
| `npm test` | Testes unitários (Vitest) |

## API de extração (GitLab e similares)

Leitura dos boards com um token da organização. Não usa o login do app. O admin gera a chave em **Integrações** (botão no painel, ou Mais, ou Administração da sala).

Rode [`supabase/migration_export_api.sql`](supabase/migration_export_api.sql) no SQL Editor antes do primeiro uso.

```bash
# Lista salas da org
curl -s "https://SEU-APP/api/export/rooms" \
  -H "Authorization: Bearer fqex_…"

# Cards de uma sala (sem arquivados; máx. 200)
curl -s "https://SEU-APP/api/export/cards?roomId=ID_DA_SALA" \
  -H "Authorization: Bearer fqex_…"
```

Query opcional em `/cards`: `archived=true`, `status=ready_for_qa`, `updatedSince=2026-09-01T00:00:00Z`, `limit`, `offset`. Também aceita `X-Api-Key` no lugar do Bearer.

Cada card traz `id`, `title`, `description`, `status`, `column`, `severity`, `url` (link no ForceQA). O GitLab cria a issue a partir disso — a API não escreve no GitLab.

O token é SHA-256 no banco; o valor completo só aparece uma vez na UI. Trocar ou revogar invalida a chave na hora.

