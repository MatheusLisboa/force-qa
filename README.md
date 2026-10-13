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

1. Crie um projeto no [Supabase](https://supabase.com/dashboard)
2. Aplique as migrations de [`supabase/migrations/`](supabase/migrations) com o Supabase CLI (`supabase link` + `supabase db push`). Passo a passo, inclusive para um banco que já existia, em [`supabase/README.md`](supabase/README.md)
3. Em **Authentication → Providers**, habilite **Email**, desative **Confirm email** (para login imediato em dev) e desmarque **Allow new users to sign up** (as contas nascem pelo app ou por convite)
4. Em **Project Settings → API**, copie:
   - `anon` `public` key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` com suas chaves:

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
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

## Qualidade e testes

O projeto tem testes automatizados em três camadas, todas rodando no CI a cada pull request:

| Camada | Ferramenta | Escopo |
|--------|-----------|--------|
| Estática | TypeScript (`npm run lint`) | Tipos, incluindo o React |
| Unitária | Vitest (`npm test`) | ~245 testes: regras de negócio em `src/lib`; auth, rate limit, logger, keep-alive, auditoria e `adminUsers` (isolamento entre organizações, último admin) em `api-src` |
| E2E | Playwright (`npm run test:e2e`) | Login, painel, paleta, tema, Kanban por teclado, comentários, filtros na URL, ações em lote, métricas, conexão e acessibilidade, em Chromium |
| RLS | PostgreSQL (`npm run test:rls`) | ~145 asserções que aplicam as migrations do zero num Postgres descartável e tentam ler/alterar dados de outra organização, escalar privilégio, burlar o "somente leitura" e forjar a auditoria, como cada papel |

- Os testes E2E rodam contra um build com **Supabase simulado** (Auth, REST e Realtime em `e2e/support/supabaseMock.ts`), então nunca tocam o backend real e são determinísticos.
- No CI, falhas geram `trace` na primeira repetição e o `playwright-report` é publicado como artefato por 7 dias.
- Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (jobs `check` e `e2e`).
- Relatório de auditoria de segurança: [`docs/security-audit`](docs/security-audit).

## Primeiro acesso

A tela de login **não tem cadastro público**. Para o primeiro admin:

1. Crie o usuário em **Authentication → Users** no Supabase (ou peça um convite a quem já é admin)
2. Em **Table Editor → `users`**, defina `role = admin` (e `is_superadmin = true` para gerenciar organizações)
3. Depois disso, admins criam as demais contas em **Usuários**, no próprio app

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
| `npm test` | Testes unitários (Vitest): lógica de `src/lib` e endpoints/auth de `api-src` |
| `npm run test:e2e` | Testes de interface (Playwright, com o Supabase simulado) |
| `npm run screenshots` | Gera screenshots das telas principais em `docs/screenshots/` |

> **Atenção:** `npm run build:vercel` sobrescreve os stubs de `api/**/*.js` pelos bundles gerados. Não commite esses bundles: depois de um build local, rode `git checkout -- api`.

## Recursos de interface

- **Paleta de comandos** (`⌘K` / `Ctrl+K`): salas, páginas e ações. `?` lista os atalhos.
- **Tema claro e escuro** (segue o sistema; o botão do cabeçalho fixa a escolha).
- **Kanban por teclado**: `↑↓` percorrem a coluna, `←→` trocam de coluna, `Shift+←/→` movem o card.
- **Instalável (PWA)** e aviso de conexão quando o tempo real cai (com ressincronização ao reconectar).
- **Comentários ricos**: cole um print com `Ctrl+V` (ou arraste), `@` autocompleta pessoas, e há markdown seguro (negrito, itálico, código, listas, links https). `Ctrl+Enter` envia.
- **Filtros na URL**: busca, ambiente, tipo, severidade e responsável viram parâmetros; "Copiar link da visão" compartilha o recorte.
- **Ações em lote** no Kanban: `Espaço` (ou a caixa do card) marca vários cards; depois mover de coluna ou atribuir de uma vez.
- **Novo card**: modelo de descrição por tipo e aviso de cards parecidos antes de salvar.
- **Métricas** (Mais → Métricas): criados × resolvidos por semana, backlog, tempo mediano de resolução, reabertura e SLA, com **Exportar PDF**.
- Erro de rede claro no login e aviso quando o servidor não responde (projeto pausado, bloqueio, deploy sem variáveis).
- Respeita `prefers-reduced-motion`.

## Permissões, visibilidade e auditoria

- **Papéis:** `admin`, `qa`, `scrum_master`, `developer`, `dba`, `devops` e `viewer`; a matriz de capacidades é editável pelo superadmin em **Permissões**. A tela mostra o que muda antes de salvar, avisa quando papéis têm exatamente as mesmas permissões (hoje QA = Scrum e Dev = DBA = DevOps: o cargo é só rótulo) e resume em português o que cada papel pode. A coluna **Admin é travada** (também no banco): ninguém tira permissão do admin.
- **Nunca sem admin:** não dá para apagar, rebaixar, mover ou transformar em convidado o **último admin** da organização (trigger no banco + checagem na API). A tela Usuários avisa quando só há um admin: o ideal é ter pelo menos dois.
- **Organização → boards → membros:** quem entra na organização (ex.: Requiem) ganha um papel e **vê os boards visíveis à organização na lista**, sem o admin marcar pessoa por pessoa. Quem não é membro **lê e comenta**; para criar e editar cards, clica em **Entrar na sala** (e passa a valer o papel dele). Admin da organização acessa tudo.
- **Visibilidade da sala** (Administrar → Acesso à sala, ou ao criar): *Visível a toda a organização* (padrão das salas novas), *Só por link ou ID* (só membros veem; qualquer pessoa da org entra pelo link) ou *Somente membros* (só entra quem for adicionado ou convidado). As salas que já existiam viram *Só por link ou ID*, exatamente o que eram: nada antigo é aberto sem o admin decidir.
- **Papel por sala:** um membro pode ficar **somente leitura só naquela sala** (olho ao lado do nome, em Administrar). Só restringe, nunca promove acima do papel global.
- **Convidados** só leem e comentam por padrão (a API cria convidados como `viewer`). Cada sala pode liberar **criar cards**; mesmo assim o convidado só edita os cards que ele mesmo criou. O link tem **validade** (24 h, 7 dias, 30 dias ou sem validade); gerar um link novo invalida o anterior.
- **Modo leitura explicado:** quando você não pode escrever, "Novo card" fica desabilitado e um aviso diz **por quê** (papel, somente leitura da sala ou convidado).
- **Token de extração (GitLab):** só **admin** gera, troca ou revoga, e pode ser limitado a **salas escolhidas** (sem escopo, lê toda a organização). Fora do escopo a API responde "sala não encontrada".
- **Auditoria** (Mais → Auditoria, só admin): quem mudou papéis, acessos, visibilidade, convites, integrações e permissões. Registrada por triggers no banco (ações feitas no navegador) e pela API (ações com `service_role`), nunca guarda tokens, senhas nem URLs de webhook, e não pode ser editada nem apagada.

## Design system

Tokens (cores, sombras, movimento) em `src/index.css` (`@theme` e `:root`); o tema claro redefine as mesmas variáveis em `:root[data-theme="light"]`. Componentes base em `src/components/ui/` (`Button`, `IconButton`, `Skeleton`, `EmptyState`, `Avatar`, `MenuItem`, `Kbd`). A página `/design` (apenas em desenvolvimento) mostra todos eles.

## Observabilidade

- API: `api-src/shared/logger.ts` emite JSON por linha em produção, com tokens e senhas mascarados.
- Navegador: defina `VITE_SENTRY_DSN` para enviar erros ao Sentry (carregado só quando há DSN).
- Rate limit compartilhado entre instâncias: depende da migration `20260101000020_rate_limits`; sem ela, cai para contagem em memória.
- **Keep-alive diário** (`/api/cron/keepalive`, agendado em `vercel.json`): uma leitura barata mantém o projeto do Supabase ativo (o plano gratuito pausa por inatividade) e, se o banco não responder, avisa o `ALERT_WEBHOOK_URL` (formato Slack/Discord/Teams). Defina `CRON_SECRET` para que só a Vercel consiga chamá-lo.

## API de extração (GitLab e similares)

Leitura dos boards com um token da organização. Não usa o login do app. Admin, QA ou Scrum gera a chave em **Integrações** (botão no painel, ou Mais, ou Administração da sala).

Requer a migration [`20260101000016_export_api`](supabase/migrations/20260101000016_export_api.sql) aplicada.

```bash
# Lista salas da org
curl -s "https://SEU-APP/api/export/rooms" \
  -H "Authorization: Bearer fqex_…"

# Cards de uma sala (sem arquivados; máx. 200)
curl -s "https://SEU-APP/api/export/cards?roomId=ID_DA_SALA" \
  -H "Authorization: Bearer fqex_…"
```

Query opcional em `/cards`: `archived=true`, `status=ready_for_qa`, `updatedSince=2026-09-01T00:00:00Z`, `limit`, `offset`. Também aceita `X-Api-Key` no lugar do Bearer.

Cada card traz `id`, `title`, `description`, `status`, `column`, `severity`, `url` (link no ForceQA) e `attachments` (prints e links). Prints no Storage vêm com URL assinada (`expiresAt`, TTL 24h) — o GitLab deve baixar no mesmo job. A API não escreve no GitLab.

O token é SHA-256 no banco; o valor completo só aparece uma vez na UI. Trocar ou revogar invalida a chave na hora.

