# ForceQA — War Room QA

Plataforma de gestão colaborativa de bugs em sessões de QA intensivas ("Salas de Guerra").

## Stack

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS
- **Backend:** Supabase (Auth + PostgreSQL + Realtime)
- **IA:** Google Gemini (server-side)

## Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar Supabase

1. Acesse o [Dashboard Supabase](https://supabase.com/dashboard/project/bdvpzgrgwgcvfgflelbn)
2. Em **SQL Editor**, execute o conteúdo de [`supabase/schema.sql`](supabase/schema.sql)
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
GEMINI_API_KEY=sua_gemini_key   # opcional
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

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor Express + Vite (porta 3000) |
| `npm run build` | Build de produção |
| `npm run lint` | Verificação TypeScript |
