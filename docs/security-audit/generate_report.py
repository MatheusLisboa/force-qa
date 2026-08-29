#!/usr/bin/env python3
"""Gera o Relatório de Auditoria de Segurança do ForceQA (PDF A4, pt-BR).

Uso (ambiente isolado, sem install global):

    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
    .venv/bin/python generate_report.py
"""

from __future__ import annotations

import xml.sax.saxutils as xml
from datetime import date
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parent
PDF_PATH = ROOT / "relatorio-auditoria-seguranca.pdf"
CHART_DIR = ROOT / "_charts"

PALETTE = {
    "critica": HexColor("#B91C1C"),
    "alta": HexColor("#EA580C"),
    "media": HexColor("#D97706"),
    "baixa": HexColor("#2563EB"),
    "informativa": HexColor("#64748B"),
    "forte": HexColor("#059669"),
    "ink": HexColor("#0F172A"),
    "muted": HexColor("#475569"),
    "line": HexColor("#E2E8F0"),
    "paper": HexColor("#F8FAFC"),
    "cover": HexColor("#0B1220"),
    "accent": HexColor("#1E293B"),
}

MPL = {
    "crítica": "#B91C1C",
    "alta": "#EA580C",
    "média": "#D97706",
    "baixa": "#2563EB",
    "informativa": "#64748B",
}

PROJECT = "ForceQA"
AUDIT_DATE = date(2026, 8, 28)
SCOPE = (
    "Código-fonte do repositório force-qa (frontend React, APIs em api-src/, "
    "server.ts, migrations SQL em supabase/, configs de deploy Vercel). "
    "Sem Docker/Helm/Terraform/CI no repositório. Histórico git varrido por "
    "padrões de segredo. Bundle dist/ ausente no workspace (não rasterizado)."
)

# ---------------------------------------------------------------------------
# Achados verificados no código
# ---------------------------------------------------------------------------

FINDINGS = [
    {
        "id": "F-01",
        "sev": "crítica",
        "cat": "Isolamento (RLS)",
        "file": "supabase/migration_organization_scope.sql",
        "lines": "124–127",
        "title": "Qualquer autenticado pode promover a si mesmo a superadmin",
        "desc": (
            "A policy users_update permite UPDATE da própria linha (id = auth.uid()) "
            "sem restrição de colunas. O trigger protect_user_role() só trava a coluna "
            "role — não is_superadmin. Um PATCH PostgREST SET is_superadmin=true "
            "escala o atacante a todas as organizações."
        ),
        "exploit": (
            "Sessão autenticada (viewer/guest inclusive) + chave anon (pública). "
            "Não depende de UI; o frontend até congela isSuperadmin em updateProfile, "
            "mas o cliente supabase-js no browser fala direto com PostgREST."
        ),
        "code": (
            "CREATE POLICY \"users_update\" ON public.users\n"
            "  FOR UPDATE TO authenticated\n"
            "  USING (id = auth.uid() OR public.can_admin_org(organization_id))\n"
            "  WITH CHECK (id = auth.uid() OR public.can_admin_org(organization_id));"
        ),
    },
    {
        "id": "F-02",
        "sev": "alta",
        "cat": "Isolamento (RLS)",
        "file": "supabase/migration_organization_scope.sql",
        "lines": "124–127",
        "title": "Troca de organization_id na própria linha (hop de tenant)",
        "desc": (
            "A mesma policy users_update autoriza o dono da linha a gravar qualquer "
            "organization_id. users_select devolve todos os perfis da org alvo "
            "(e-mail, nome, papel). O trigger não protege organization_id."
        ),
        "exploit": (
            "Precisa de um UUID de org válido (o default 11111111-… está no código; "
            "outros vazam no perfil após um join de guest). Depois o atacante lê PII "
            "do tenant alvo via SELECT em users."
        ),
        "code": (
            "USING (id = auth.uid() OR public.can_admin_org(organization_id))\n"
            "WITH CHECK (id = auth.uid() OR public.can_admin_org(organization_id));"
        ),
    },
    {
        "id": "F-03",
        "sev": "alta",
        "cat": "Isolamento (RLS)",
        "file": "supabase/migration_create_organization_admin.sql",
        "lines": "45–74",
        "title": "Trigger de signup confia em user_metadata (org e papel)",
        "desc": (
            "handle_new_auth_user() lê role e organization_id de raw_user_meta_data, "
            "controlado pelo cliente no signUp. Papéis não-admin (qa, scrum_master, …) "
            "são aceitos. Se o UUID da org existir, o usuário nasce dentro do tenant."
        ),
        "exploit": (
            "Explorável enquanto o Auth permitir signUp — o fluxo de convidado "
            "(AuthContext.tsx:268) prova que o cadastro público está habilitado. "
            "A UI de login não oferece signup, mas a anon key no browser basta."
        ),
        "code": (
            "user_role := NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), '');\n"
            "...\n"
            "ELSIF user_role = ANY(non_admin_roles) THEN\n"
            "  assigned_role := user_role;\n"
            "org_id := NULLIF(TRIM(NEW.raw_user_meta_data->>'organization_id'), '')::uuid;\n"
            "COALESCE(org_id, public.default_organization_id())"
        ),
    },
    {
        "id": "F-04",
        "sev": "alta",
        "cat": "IDOR",
        "file": "api-src/guest/validate-room.ts + api-src/shared/rooms.ts",
        "lines": "validate-room.ts:12–14; rooms.ts:23–41, 69–93",
        "title": "Sala enumerável sem auth; guest entra e herda a org da sala",
        "desc": (
            "POST /api/guest/validate-room não chama requireUser. Com service_role, "
            "busca sala por id ou ILIKE no nome e devolve {id, name}. 404 vs 403 "
            "ainda confirma existência. joinRoom, para isGuest=true, pula o check "
            "de org e grava users.organization_id = roomOrgId via service_role."
        ),
        "exploit": (
            "Produto exige link da sala, mas o nome (ILIKE) e a ausência de auth "
            "transformam isso em enumeração. Depois o guest autentica (signUp) e "
            "entra na org da vítima. can_guest_join_room() também não filtra tenant."
        ),
        "code": (
            "# validate-room.ts — sem requireUser\n"
            "const result = await validateGuestRoom(...);\n"
            "admin.from(\"war_rooms\").select(\"id, name, ...\").ilike(\"name\", trimmed)\n"
            "# joinRoom guest:\n"
            "if (roomOrgId) {\n"
            "  await admin.from(\"users\").update({ organization_id: roomOrgId }).eq(\"id\", userId);\n"
            "}"
        ),
    },
    {
        "id": "F-05",
        "sev": "alta",
        "cat": "Isolamento (RLS)",
        "file": "supabase/migration_access_and_security.sql",
        "lines": "491–511",
        "title": "Bucket evidence público e SELECT liberado a TO public",
        "desc": (
            "O bucket é public=true e a policy evidence_select permite SELECT a "
            "qualquer um (anon). Quem listar storage.objects lê todas as evidências "
            "de todos os tenants. URL pública também basta se o path vazar."
        ),
        "exploit": (
            "Sem autenticação. Condição: migration_access_and_security.sql aplicada "
            "(está no run order). O client usa getPublicUrl — o segredo é o path, "
            "não a sessão."
        ),
        "code": (
            "INSERT INTO storage.buckets (..., public, ...)\n"
            "VALUES ('evidence', 'evidence', true, ...)\n"
            "CREATE POLICY \"evidence_select\" ON storage.objects\n"
            "  FOR SELECT TO public\n"
            "  USING (bucket_id = 'evidence');"
        ),
    },
    {
        "id": "F-06",
        "sev": "alta",
        "cat": "IDOR",
        "file": "supabase/migration_access_and_security.sql",
        "lines": "413–415",
        "title": "comments_update não exige membership da sala destino",
        "desc": (
            "UPDATE em bug_comments só exige user_id = auth.uid(). Sem WITH CHECK "
            "de is_room_member, o USING vale para a linha nova: o dono do comentário "
            "pode mudar war_room_id (e bug_id) para qualquer sala. Membros da sala "
            "alvo passam a ver o texto (comments_select usa is_room_member)."
        ),
        "exploit": (
            "Autenticado que já comentou em alguma sala + UUID/id da sala alvo "
            "(vazável por F-04). Injeção de conteúdo entre tenants."
        ),
        "code": (
            "CREATE POLICY \"comments_update\" ON public.bug_comments\n"
            "  FOR UPDATE TO authenticated\n"
            "  USING (user_id = auth.uid());"
        ),
    },
    {
        "id": "F-07",
        "sev": "média",
        "cat": "IDOR",
        "file": "api-src/rooms/invite.ts + server.ts",
        "lines": "invite.ts:14–23; server.ts:115–123",
        "title": "redirectTo do convite copia o header Origin",
        "desc": (
            "O e-mail de convite (inviteUserByEmail) usa redirectTo montado com "
            "req.headers.origin. Origin é controlado pelo cliente. Um QA/admin "
            "autenticado pode apontar o magic link para um domínio de phishing."
        ),
        "exploit": (
            "Requer papel admin/qa/scrum_master (API valida isso). Não é IDOR de "
            "objeto; é open redirect no fluxo de convite."
        ),
        "code": (
            "const origin = String(req.headers.origin || process.env.APP_URL || \"https://force-qa.vercel.app\");\n"
            "redirectTo: `${origin.replace(/\\/$/, \"\")}/`,"
        ),
    },
    {
        "id": "F-08",
        "sev": "média",
        "cat": "Isolamento (RLS)",
        "file": "supabase/migration_access_and_security.sql",
        "lines": "513–518",
        "title": "Upload no bucket evidence sem amarrar path ao tenant/sala",
        "desc": (
            "evidence_insert só checa can_write_bugs(). Qualquer não-viewer pode "
            "gravar em qualquer prefixo (ex.: pasta de outra sala). Combinado com "
            "F-05, o objeto fica publicamente legível."
        ),
        "exploit": (
            "Papel ≠ viewer. O client (evidence.ts:39) usa `${roomId}/uuid.ext` "
            "mas o Storage não valida isso."
        ),
        "code": (
            "CREATE POLICY \"evidence_insert\" ON storage.objects\n"
            "  FOR INSERT TO authenticated\n"
            "  WITH CHECK (bucket_id = 'evidence' AND public.can_write_bugs());"
        ),
    },
    {
        "id": "F-09",
        "sev": "média",
        "cat": "Permissão no cliente",
        "file": "api-src/ai/generate-report.ts + suggest-bug-fields.ts + detect-duplicate.ts",
        "lines": "generate-report.ts:200–203; suggest:12; detect:12",
        "title": "Rotas de IA só exigem usuário autenticado",
        "desc": (
            "requireUser sem papel, sem membership de sala e sem rate limit. "
            "Viewer/guest autenticado chama as três rotas. generate-report aceita "
            "metrics no body (não lê o board no servidor). A UI esconde criação "
            "de card para viewer, mas a aba Relatório IA fica visível para qualquer "
            "membro (WarRoomDetail.tsx:504–514)."
        ),
        "exploit": (
            "Abuso de cota (Gemini/OpenRouter). Não lê dados de outro tenant no "
            "banco — o JSON vem do cliente. Guest da F-04 também dispara IA."
        ),
        "code": (
            "await requireUser(req.headers.authorization);\n"
            "const result = await generateExecutiveReport(body.metrics);"
        ),
    },
    {
        "id": "F-10",
        "sev": "média",
        "cat": "XSS",
        "file": "src/components/BugDetailModal.tsx",
        "lines": "390–392",
        "title": "href de evidência sem allowlist de esquema",
        "desc": (
            "evidenceUrl controlado pelo usuário vira href direto. isImageEvidence / "
            "isHttpEvidence não rejeitam javascript: — evidenceLabel cai em \"link\" "
            "e o âncora é renderizado. Sem DOMPurify no package.json. React escapa "
            "texto, mas não sanitiza URLs em href."
        ),
        "exploit": (
            "Quem pode escrever bugs (can_write_bugs) grava evidence_url=javascript:… "
            "Outro membro clica. XSS armazenado no mesmo tenant. updateBugField "
            "(services.ts:267) não valida URL."
        ),
        "code": (
            "<a href={activeBug.evidenceUrl} target=\"_blank\" rel=\"noopener noreferrer\" ...>"
        ),
    },
    {
        "id": "F-11",
        "sev": "baixa",
        "cat": "Isolamento (RLS)",
        "file": "supabase/migration_create_organization_admin.sql",
        "lines": "4",
        "title": "GRANT amplo em organizations para o papel anon",
        "desc": (
            "GRANT SELECT, INSERT, UPDATE, DELETE TO anon, authenticated, service_role. "
            "Policies de organizations são TO authenticated + is_superadmin; anon sem "
            "policy RLS é deny. Superfície extra se uma policy futura for frouxa."
        ),
        "exploit": "Não explorável com as policies atuais. Endurecimento.",
        "code": (
            "GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO anon, authenticated, service_role;"
        ),
    },
    {
        "id": "F-12",
        "sev": "baixa",
        "cat": "IDOR",
        "file": "src/lib/services.ts",
        "lines": "247–290",
        "title": "warRoomId do activity log vem do cliente",
        "desc": (
            "updateBugField atualiza o bug por id (RLS da sala do bug) e grava o log "
            "com o warRoomId enviado pelo browser. logs_insert exige is_room_member "
            "desse id — não cruza tenant, mas permite log enganoso em outra sala "
            "da mesma org da qual o usuário já é membro."
        ),
        "exploit": "Integridade no mesmo tenant. RLS impede org alheia.",
        "code": (
            "await supabase.from(\"bugs\").update(payload).eq(\"id\", bugId);\n"
            "await createActivityLog({ bugId, warRoomId, userId, ... });"
        ),
    },
    {
        "id": "F-13",
        "sev": "informativa",
        "cat": "Segredos",
        "file": ".env.example + supabase/schema.sql",
        "lines": ".env.example:2; schema.sql (comentário de projeto)",
        "title": "URL real do projeto Supabase versionada",
        "desc": (
            "VITE_SUPABASE_URL aponta para bdvpzgrgwgcvfgflelbn.supabase.co. Não é "
            "service_role. Anon/service_role no example são placeholders. Histórico "
            "git não contém eyJ de service_role nem AIza/sk_live reais."
        ),
        "exploit": "Reconhecimento; a anon key de produção está no bundle Vite (esperado).",
        "code": (
            "VITE_SUPABASE_URL=\"https://bdvpzgrgwgcvfgflelbn.supabase.co\"\n"
            "VITE_SUPABASE_ANON_KEY=\"SUA_ANON_KEY_AQUI\"\n"
            "SUPABASE_SERVICE_ROLE_KEY=\"SUA_SERVICE_ROLE_KEY_AQUI\""
        ),
    },
    {
        "id": "F-14",
        "sev": "informativa",
        "cat": "Segredos",
        "file": "src/lib/supabase.ts",
        "lines": "17–40",
        "title": "Anon key embutida no bundle (modelo Supabase) e fallback placeholder",
        "desc": (
            "Vite embute VITE_* no JS. A anon key é pública por desenho. Fallbacks "
            "https://placeholder.supabase.co e \"placeholder\" não são segredos. "
            "getSupabaseAdmin() exige SUPABASE_SERVICE_ROLE_KEY no servidor e falha "
            "sem default. Nenhum ${VAR:-segredo} no repo. Sem Docker/CI/Helm."
        ),
        "exploit": "N/A — comportamento esperado. Anon + F-01 é que vira arma.",
        "code": (
            "const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;\n"
            "const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;\n"
            "createClient(supabaseUrl || \"https://placeholder.supabase.co\", supabaseAnonKey || \"placeholder\")"
        ),
    },
]

STRENGTHS = [
    (
        "APIs admin validam privilégio no servidor",
        "requireAdmin em create-user e delete-user; requireSuperadmin em "
        "create-organization e move-user (api-src/shared/auth.ts:55–68 e handlers "
        "em api-src/admin/). A UI (App.tsx:391–395) esconde as telas, e o backend "
        "repete o gate.",
    ),
    (
        "delete-user recusa outra org e o próprio superadmin",
        "api-src/shared/adminUsers.ts:270–289 checa ator ≠ alvo, is_superadmin do "
        "alvo e organization_id.",
    ),
    (
        "Convite de sala checa papel, org e membership",
        "inviteToRoom (rooms.ts:119–147): só admin/qa/scrum_master ou superadmin; "
        "recusa sala de outra org; QA/SM precisa ser membro.",
    ),
    (
        "Join de usuário não-guest exige org + membership",
        "rooms.ts:69–88 devolve 403 se a sala é de outra organização ou se não há "
        "linha em room_members. (O furo é só o ramo guest.)",
    ),
    (
        "protect_user_role impede auto-promover role=admin",
        "migration_create_organization_admin.sql:13–27. Não cobre is_superadmin "
        "(F-01), mas o papel admin via coluna role está travado.",
    ),
    (
        "Signup não promove admin via user_metadata",
        "handle_new_auth_user só aceita admin a partir de app_metadata (não "
        "gravável pelo cliente). user_metadata cai na lista non_admin_roles.",
    ),
    (
        "SELECT de notificações preso ao dono",
        "notifications_select USING (user_id = auth.uid()) em "
        "migration_access_and_security.sql:466–468.",
    ),
    (
        "Bugs/salas/projetos SELECT via is_room_member (pós-migration 11)",
        "A função is_room_member foi reescrita em organization_scope.sql:51–73 "
        "para exigir a mesma org (admin da org vê as salas; superadmin atravessa). "
        "war_rooms_select / bugs_select / projects_select continuam usando essa "
        "função — isolamento de leitura ok se a migration 11 rodou.",
    ),
    (
        "Mutações de organizations só superadmin",
        "organizations_insert/update/delete WITH CHECK is_superadmin "
        "(organization_scope.sql:146–157). renameOrganization no client depende disso.",
    ),
    (
        "Sem segredos hardcoded nem defaults ${VAR:-secret}",
        "Service role / Gemini / OpenRouter vêm de process.env; getSupabaseAdmin "
        "lança se a key falta (auth.ts:10–15). .gitignore ignora .env*. Git log "
        "não mostrou JWT de service_role real.",
    ),
    (
        "XSS clássico de HTML evitado no React",
        "Zero dangerouslySetInnerHTML / innerHTML / eval / new Function. "
        "Comentários e títulos interpolados como texto. Relatório IA "
        "(AIReportModal.tsx:182) renderiza markdown como texto (whitespace-pre-wrap), "
        "não como HTML. Sem lib de sanitização — e, nos pontos de HTML, não foi "
        "necessária. O gap é URL em href (F-10).",
    ),
    (
        "Frontend congela campos privilegiados no updateProfile",
        "AuthContext.tsx:386–396 força role, organizationId e isSuperadmin do "
        "perfil já carregado. Defesa na UI; insuficiente contra PostgREST direto (F-01).",
    ),
]

# Handlers percorridos (cobertura IDOR)
HANDLERS = [
    ("POST /api/admin/create-user", "requireAdmin + org do ator (superadmin pode escolher org)"),
    ("POST /api/admin/create-organization", "requireSuperadmin"),
    ("POST /api/admin/delete-user", "requireAdmin + posse de org + bloqueio de superadmin"),
    ("POST /api/admin/move-user", "requireSuperadmin"),
    ("POST /api/rooms/invite", "requireUser + papel + org da sala + membership se não admin"),
    ("POST /api/rooms/join", "requireUser; não-guest: org + membership; guest: F-04"),
    ("POST /api/guest/validate-room", "sem auth — F-04"),
    ("POST /api/ai/suggest-bug-fields", "requireUser apenas — F-09"),
    ("POST /api/ai/detect-duplicate", "requireUser apenas — F-09"),
    ("POST /api/ai/generate-report", "requireUser; metrics do body — F-09"),
]

ISSUES = [
    {
        "n": 1,
        "title": "[Segurança] Escalação a superadmin e troca de organização via UPDATE em users",
        "labels": "security, severity:critical",
        "findings": ["F-01", "F-02"],
        "body": """## Problema
A policy RLS `users_update` autoriza qualquer autenticado a atualizar a **própria** linha sem restrição de colunas. O trigger `protect_user_role()` só protege a coluna `role`. Com a anon key (pública no frontend) o atacante chama PostgREST e grava `is_superadmin = true` e/ou `organization_id` de outro tenant.

O frontend (`AuthContext.updateProfile`) congela esses campos na UI — isso **não** é controle de acesso.

## Por que é explorável
- Policy USING/WITH CHECK: `id = auth.uid() OR can_admin_org(...)`.
- Nenhuma column policy / trigger em `is_superadmin` ou `organization_id`.
- Cliente supabase-js no browser fala com `/rest/v1/users`.

## Evidência
`supabase/migration_organization_scope.sql:124-127`
```sql
CREATE POLICY "users_update" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.can_admin_org(organization_id))
  WITH CHECK (id = auth.uid() OR public.can_admin_org(organization_id));
```
`supabase/migration_create_organization_admin.sql:6-29` — trigger só compara `NEW.role`.

## Impacto
- **Crítico:** qualquer login vira superadmin (lê/escreve todas as orgs, cria orgs, move usuários).
- **Alto:** hop de tenant e leitura de e-mails/nomes da org alvo (`users_select`).

## Sugestão de correção
1. Trigger `protect_user_privileges`: se `is_superadmin` ou `organization_id` mudarem e o caller não for superadmin (via `auth.uid()` + flag **antiga** da linha, ou service_role), `RAISE EXCEPTION`.
2. Alternativa: policy de UPDATE só para `name`, `avatar_url`, `squad` via view atualizável / `GRANT UPDATE (colunas)` e revogar UPDATE amplo.
3. `is_superadmin` só mutável por service_role (APIs admin).

## Critérios de aceite
- [ ] `UPDATE users SET is_superadmin = true WHERE id = auth.uid()` com JWT de viewer falha.
- [ ] `UPDATE users SET organization_id = '<outra>' WHERE id = auth.uid()` com JWT de viewer falha.
- [ ] Superadmin / API service_role ainda consegue promover e mover usuários.
- [ ] `UPDATE` do próprio `name`/`avatar_url` continua permitido.
""",
    },
    {
        "n": 2,
        "title": "[Segurança] Trigger de signup aceita organization_id e role do cliente",
        "labels": "security, severity:high",
        "findings": ["F-03"],
        "body": """## Problema
`handle_new_auth_user` lê `raw_user_meta_data.role` e `organization_id`. O cliente controla esses campos no `signUp`. Papéis qa/scrum_master/etc. são aceitos. Se o UUID da org existir, o usuário entra no tenant sem convite.

## Por que é explorável
O fluxo de convidado chama `supabase.auth.signUp` (`src/context/AuthContext.tsx:268`), então o cadastro Auth está habilitado. A tela de login não precisa oferecer signup: a anon key basta no DevTools.

## Evidência
`supabase/migration_create_organization_admin.sql:45-74`
```sql
user_role := NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), '');
ELSIF user_role = ANY(non_admin_roles) THEN
  assigned_role := user_role;
org_id := NULLIF(TRIM(NEW.raw_user_meta_data->>'organization_id'), '')::uuid;
-- INSERT ... COALESCE(org_id, public.default_organization_id())
```

## Impacto
Conta QA/SM na org da vítima (UUID default é público; outros vazam após guest join). Bypass do modelo convite-only.

## Sugestão de correção
- Ignorar `organization_id` e `role` de `user_metadata` no trigger. Sempre `viewer` + org default (ou null até o convite).
- Só gravar org/role via `app_metadata` setada por service_role (já usado em `inviteUserByEmail` / admin create-user).
- Desabilitar signUp público no dashboard se o produto for convite-only; guest deve usar um endpoint server-side.

## Critérios de aceite
- [ ] `signUp({ data: { organization_id: '<org vítima>', role: 'qa' } })` resulta em viewer na org default.
- [ ] Convite admin e create-user continuam aplicando org/role corretos.
- [ ] Guest não escolhe org no metadata (só o servidor).
""",
    },
    {
        "n": 3,
        "title": "[Segurança] Validação de sala sem autenticação e guest herda a organização",
        "labels": "security, severity:high",
        "findings": ["F-04"],
        "body": """## Problema
`POST /api/guest/validate-room` não autentica e, com service_role, resolve sala por **id ou nome (ILIKE)** devolvendo `{id, name}`. 403 (guest desligado) vs 404 confirma existência. `joinRoom` no ramo guest **não** checa organização e faz `users.organization_id = room.organization_id`.

## Por que é explorável
1. Enumerar nomes de salas sem login.
2. Criar guest (`signUp`) e `POST /api/rooms/join` — entra na org da sala.

## Evidência
`api-src/guest/validate-room.ts:12-14` — sem `requireUser`.
`api-src/shared/rooms.ts:23-41` (lookup ilike + 403/404).
`api-src/shared/rooms.ts:69-93` (guest pula org check e atualiza `organization_id`).
`server.ts:88-94` espelha a rota.

`can_guest_join_room` (`migration_access_and_security.sql:132-145`) também não filtra tenant.

## Impacto
Acesso de leitura ao Kanban/bugs/comentários da org alvo (admin da org vê o guest em `users`). PII de colegas via `users_select`.

## Sugestão de correção
- `validate-room`: exigir token opaco de convite (não nome), rate limit, resposta uniforme.
- Guest: **não** migrar `organization_id`; membership isolada sem virar colega da org.
- Ou: convite guest one-time gerado pelo servidor, amarrado à sala.

## Critérios de aceite
- [ ] Sem auth, validate-room não devolve id/nome (ou exige segredo do link).
- [ ] ILIKE por nome não existe mais (ou só para membros autenticados da org).
- [ ] Guest autenticado **não** altera `users.organization_id`.
- [ ] Usuário logado de outra org continua 403 no join (já verdadeiro).
""",
    },
    {
        "n": 4,
        "title": "[Segurança] Bucket de evidências público e upload sem vínculo de tenant",
        "labels": "security, severity:high",
        "findings": ["F-05", "F-08"],
        "body": """## Problema
Bucket `evidence` é `public = true` e `evidence_select` é `TO public USING (bucket_id = 'evidence')`. Qualquer um lista/baixa todos os arquivos. `evidence_insert` só exige `can_write_bugs()` — sem prefixo de org/sala.

## Por que é explorável
Storage list API usa SELECT. Sem JWT. Upload: autenticado não-viewer grava em path arbitrário; URL pública (`getPublicUrl` em `src/lib/evidence.ts:52-53`).

## Evidência
`supabase/migration_access_and_security.sql:491-518`
```sql
public = true
CREATE POLICY "evidence_select" ... FOR SELECT TO public USING (bucket_id = 'evidence');
CREATE POLICY "evidence_insert" ... WITH CHECK (bucket_id = 'evidence' AND public.can_write_bugs());
```

## Impacto
Vazamento cross-tenant de screenshots/evidências. Poluição de pastas de outras salas.

## Sugestão de correção
- Bucket **privado**. SELECT autenticado + `is_room_member(split_part(name,'/',1))` (path `roomId/uuid.ext`).
- INSERT WITH CHECK o prefixo é sala da org do caller e `is_room_member`.
- Frontend: `createSignedUrl` em vez de `getPublicUrl`.

## Critérios de aceite
- [ ] Anon não lista nem baixa objetos de `evidence`.
- [ ] Membro da sala A não lê path da sala B.
- [ ] Upload com path de outra org falha.
- [ ] App ainda exibe evidência para quem é membro (URL assinada).
""",
    },
    {
        "n": 5,
        "title": "[Segurança] IDOR em UPDATE de comentários (war_room_id livre)",
        "labels": "security, severity:high",
        "findings": ["F-06", "F-12"],
        "body": """## Problema
`comments_update` só exige `user_id = auth.uid()`. Sem WITH CHECK de `is_room_member`, o autor altera `war_room_id`/`bug_id` para outra sala; os membros dela veem o comentário.

Menor: `updateBugField` usa `warRoomId` do cliente no activity log (mesmo tenant, se já for membro).

## Evidência
`supabase/migration_access_and_security.sql:413-415`
```sql
CREATE POLICY "comments_update" ON public.bug_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
```
`src/lib/services.ts:247-290` — log com `warRoomId` do caller.

## Impacto
Injeção de conteúdo entre salas/tenants. Integridade de auditoria no mesmo tenant (F-12).

## Sugestão de correção
```sql
USING (user_id = auth.uid() AND is_room_member(war_room_id))
WITH CHECK (user_id = auth.uid() AND is_room_member(war_room_id)
            AND war_room_id IS NOT DISTINCT FROM OLD.war_room_id);
```
No client, derivar `warRoomId` do bug no servidor (não há API própria — vale trigger que copie `bugs.war_room_id`).

## Critérios de aceite
- [ ] PATCH de `war_room_id` no próprio comentário falha.
- [ ] Autor ainda edita o **texto** do comentário na sala original.
- [ ] Log de atividade não pode ser gravado numa sala da qual o user não é membro (já RLS) e o `war_room_id` bate com o do bug.
""",
    },
    {
        "n": 6,
        "title": "[Segurança] Convite usa Origin do request como redirectTo",
        "labels": "security, severity:medium",
        "findings": ["F-07"],
        "body": """## Problema
`inviteUserByEmail` recebe `redirectTo` montado com `req.headers.origin`. Um ator com permissão de convite aponta o magic link para um site de phishing.

## Evidência
`api-src/rooms/invite.ts:14-23`
`server.ts:115-123`
```ts
const origin = String(req.headers.origin || process.env.APP_URL || "https://force-qa.vercel.app");
redirectTo: `${origin.replace(/\\/$/, "")}/`,
```

## Impacto
Roubo de sessão/recuperação de convite do convidado (terceiro). Requer papel QA/admin/SM.

## Sugestão de correção
Allowlist: `APP_URL` / `https://force-qa.vercel.app` / localhost só em dev. Ignorar `Origin`.

## Critérios de aceite
- [ ] Header `Origin: https://evil.example` não aparece no redirect do e-mail.
- [ ] Convite real ainda redireciona para o app de produção.
""",
    },
    {
        "n": 7,
        "title": "[Segurança] Endpoints de IA sem papel, membership ou rate limit",
        "labels": "security, severity:medium",
        "findings": ["F-09"],
        "body": """## Problema
`/api/ai/suggest-bug-fields`, `detect-duplicate` e `generate-report` só chamam `requireUser`. Viewer/guest disparam Gemini/OpenRouter. `generate-report` não valida se o caller é membro de sala; `metrics` vem do body.

A aba Relatório IA não está escondida por papel (`WarRoomDetail.tsx:504-514`). A criação de card sim (canWriteBugs).

## Evidência
`api-src/ai/generate-report.ts:200-203`
`api-src/ai/suggest-bug-fields.ts:12`
`api-src/ai/detect-duplicate.ts:12`
`server.ts:131-162`

## Impacto
Custo de API / DoS financeiro. Não é leitura de outro tenant no Postgres.

## Sugestão de correção
- Exigir `can_write_bugs` ou admin/QA; recusar `is_guest`.
- Rate limit por `user.id` / org.
- Relatório: receber `roomId`, carregar métricas no servidor com service_role **só se** `is_room_member`.

## Critérios de aceite
- [ ] JWT de viewer/guest recebe 403 nas três rotas.
- [ ] QA membro da sala continua 200.
- [ ] generate-report com roomId de outra org retorna 403.
""",
    },
    {
        "n": 8,
        "title": "[Segurança] URL de evidência em href sem allowlist de esquema",
        "labels": "security, severity:medium",
        "findings": ["F-10"],
        "body": """## Problema
`BugDetailModal` usa `href={activeBug.evidenceUrl}` para links não-imagem. `javascript:` não é filtrado. Sem sanitizer no projeto. React escapa texto, não URLs.

## Evidência
`src/components/BugDetailModal.tsx:390-392`
`src/lib/evidence.ts:13-28` (`evidenceLabel` cai em `"link"`).
`src/lib/services.ts:267` grava `evidence_url` sem validar esquema.

## Impacto
XSS armazenado no tenant para quem clica o link (precisa de papel com escrita em bugs).

## Sugestão de correção
Allowlist `https:` (e paths do Storage). Recusar `javascript:`, `data:`, `file:`. Constraint CHECK no Postgres. `rel="noopener noreferrer"` já está.

## Critérios de aceite
- [ ] Card com `evidence_url=javascript:alert(1)` não vira `<a href="javascript:...">`.
- [ ] Links `https://` legítimos continuam abrindo.
- [ ] INSERT/UPDATE com esquema inválido falha no banco ou no client.
""",
    },
    {
        "n": 9,
        "title": "[Segurança] GRANT anon em organizations e schema.sql legado com USING(true)",
        "labels": "security, severity:low",
        "findings": ["F-11"],
        "body": """## Problema
`GRANT ... ON organizations TO anon` é desnecessário: policies são `TO authenticated`. `schema.sql` (passo 1 do run order) cria policies `USING (true)` em bugs/war_rooms — inseguro se alguém aplicar **só** esse arquivo.

## Evidência
`supabase/migration_create_organization_admin.sql:4`
`supabase/schema.sql` (policies iniciais USING true)
`supabase/00_run_order.sql` lista schema.sql depois overlay de migrations 8–13.

## Impacto
Baixo com o run order completo. Risco operacional (ambiente montado pela metade).

## Sugestão de correção
- `REVOKE ALL ON public.organizations FROM anon;`
- Comentário explícito no topo de `schema.sql`: não usar em produção sem as migrations de isolamento.
- Ideal: policies iniciais já restritas ou schema.sql sem policies (só DDL).

## Critérios de aceite
- [ ] `\\dp organizations` não lista anon com DML.
- [ ] Ambiente que rode apenas schema.sql não fica com SELECT público (ou o README proíbe esse atalho de forma inequívoca + CI aplica o run order).
""",
    },
]


def _register_fonts() -> tuple[str, str, str]:
    import matplotlib as mpl

    ttf = Path(mpl.get_data_path()) / "fonts" / "ttf"
    regular = str(ttf / "DejaVuSans.ttf")
    bold = str(ttf / "DejaVuSans-Bold.ttf")
    mono = str(ttf / "DejaVuSansMono.ttf")
    pdfmetrics.registerFont(TTFont("DejaVu", regular))
    pdfmetrics.registerFont(TTFont("DejaVu-Bold", bold))
    pdfmetrics.registerFont(TTFont("DejaVu-Mono", mono))
    return "DejaVu", "DejaVu-Bold", "DejaVu-Mono"


def _styles(font: str, font_b: str, mono: str) -> dict:
    ss = getSampleStyleSheet()
    styles = {
        "cover_kicker": ParagraphStyle(
            "cover_kicker", parent=ss["Normal"], fontName=font, fontSize=9,
            textColor=HexColor("#94A3B8"), tracking=1.2, spaceAfter=6,
        ),
        "cover_title": ParagraphStyle(
            "cover_title", parent=ss["Title"], fontName=font_b, fontSize=22,
            leading=28, textColor=white, alignment=TA_LEFT, spaceAfter=10,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub", parent=ss["Normal"], fontName=font, fontSize=10,
            leading=14, textColor=HexColor("#CBD5E1"),
        ),
        "h1": ParagraphStyle(
            "h1", parent=ss["Heading1"], fontName=font_b, fontSize=16,
            leading=20, textColor=PALETTE["ink"], spaceBefore=4, spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "h2", parent=ss["Heading2"], fontName=font_b, fontSize=12.5,
            leading=16, textColor=PALETTE["ink"], spaceBefore=12, spaceAfter=6,
        ),
        "h3": ParagraphStyle(
            "h3", parent=ss["Heading3"], fontName=font_b, fontSize=10.5,
            leading=14, textColor=PALETTE["accent"], spaceBefore=8, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body", parent=ss["Normal"], fontName=font, fontSize=9,
            leading=13, textColor=PALETTE["ink"], alignment=TA_JUSTIFY, spaceAfter=6,
        ),
        "body_left": ParagraphStyle(
            "body_left", parent=ss["Normal"], fontName=font, fontSize=9,
            leading=13, textColor=PALETTE["ink"], alignment=TA_LEFT, spaceAfter=6,
        ),
        "muted": ParagraphStyle(
            "muted", parent=ss["Normal"], fontName=font, fontSize=8.5,
            leading=12, textColor=PALETTE["muted"], alignment=TA_LEFT, spaceAfter=4,
        ),
        "small": ParagraphStyle(
            "small", parent=ss["Normal"], fontName=font, fontSize=8,
            leading=11, textColor=PALETTE["ink"], alignment=TA_LEFT,
        ),
        "cell": ParagraphStyle(
            "cell", parent=ss["Normal"], fontName=font, fontSize=7.5,
            leading=10, textColor=PALETTE["ink"],
        ),
        "cell_b": ParagraphStyle(
            "cell_b", parent=ss["Normal"], fontName=font_b, fontSize=7.5,
            leading=10, textColor=PALETTE["ink"],
        ),
        "chip": ParagraphStyle(
            "chip", parent=ss["Normal"], fontName=font_b, fontSize=7,
            leading=9, textColor=white, alignment=TA_CENTER,
        ),
        "code": ParagraphStyle(
            "code", parent=ss["Code"], fontName=mono, fontSize=7,
            leading=9.5, textColor=HexColor("#1E293B"), backColor=HexColor("#F1F5F9"),
            leftIndent=4, rightIndent=4, spaceBefore=4, spaceAfter=8,
        ),
        "issue_meta": ParagraphStyle(
            "issue_meta", parent=ss["Normal"], fontName=font, fontSize=8,
            leading=11, textColor=PALETTE["muted"],
        ),
        "footer": ParagraphStyle(
            "footer", parent=ss["Normal"], fontName=font, fontSize=7.5,
            textColor=HexColor("#64748B"),
        ),
        "caption": ParagraphStyle(
            "caption", parent=ss["Normal"], fontName=font, fontSize=8,
            leading=11, textColor=PALETTE["muted"], alignment=TA_CENTER, spaceAfter=10,
        ),
        "bullet": ParagraphStyle(
            "bullet", parent=ss["Normal"], fontName=font, fontSize=9,
            leading=12.5, textColor=PALETTE["ink"], leftIndent=0, spaceAfter=3,
        ),
    }
    return styles


def _esc(text: str) -> str:
    return xml.escape(text).replace("\n", "<br/>")


def _sev_color(sev: str) -> HexColor:
    return PALETTE.get(sev, PALETTE["informativa"])


def _count_by(key: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for f in FINDINGS:
        out[f[key]] = out.get(f[key], 0) + 1
    return out


def _make_charts() -> tuple[Path, Path]:
    CHART_DIR.mkdir(parents=True, exist_ok=True)
    order = ["crítica", "alta", "média", "baixa", "informativa"]
    counts = _count_by("sev")
    sizes = [counts.get(k, 0) for k in order]
    colors = [MPL[k] for k in order]

    fig, ax = plt.subplots(figsize=(5.2, 3.4), dpi=160)
    wedges, _ = ax.pie(
        sizes, colors=colors, startangle=90,
        wedgeprops=dict(width=0.46, edgecolor="white", linewidth=2),
    )
    centre = plt.Circle((0, 0), 0.58, fc="white")
    ax.add_artist(centre)
    ax.text(0, 0.08, str(sum(sizes)), ha="center", va="center", fontsize=18, fontweight="bold", color="#0F172A")
    ax.text(0, -0.18, "achados", ha="center", va="center", fontsize=8, color="#64748B")
    ax.legend(
        wedges, [f"{k} ({counts.get(k, 0)})" for k in order],
        loc="center left", bbox_to_anchor=(0.95, 0.5), frameon=False, fontsize=8,
    )
    ax.set_aspect("equal")
    fig.tight_layout()
    donut = CHART_DIR / "donut.png"
    fig.savefig(donut, bbox_inches="tight", facecolor="white")
    plt.close(fig)

    cat_order = [
        "Isolamento (RLS)",
        "Permissão no cliente",
        "IDOR",
        "Segredos",
        "XSS",
    ]
    cat_counts = [sum(1 for f in FINDINGS if f["cat"] == c) for c in cat_order]
    fig, ax = plt.subplots(figsize=(6.2, 3.2), dpi=160)
    bars = ax.barh(cat_order[::-1], cat_counts[::-1], color="#1E3A5F", height=0.55)
    ax.set_xlabel("Achados", color="#475569", fontsize=8)
    ax.tick_params(colors="#334155", labelsize=8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#E2E8F0")
    ax.spines["bottom"].set_color("#E2E8F0")
    ax.set_xlim(0, max(cat_counts) + 1.5)
    for bar, n in zip(bars, cat_counts[::-1]):
        ax.text(bar.get_width() + 0.12, bar.get_y() + bar.get_height() / 2,
                str(n), va="center", fontsize=8, color="#0F172A")
    fig.tight_layout()
    bars_path = CHART_DIR / "bars.png"
    fig.savefig(bars_path, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return donut, bars_path


def _chip_table(sev: str, styles: dict) -> Table:
    label = sev.upper()
    data = [[Paragraph(label, styles["chip"])]]
    t = Table(data, colWidths=[2.4 * cm], rowHeights=[0.55 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _sev_color(sev)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("ROUNDEDCORNERS", [3, 3, 3, 3]),
    ]))
    return t


def _code_block(text: str, styles: dict) -> Table:
    inner = Paragraph(_esc(text).replace("  ", "&nbsp;&nbsp;"), styles["code"])
    t = Table([[inner]], colWidths=[17 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#F1F5F9")),
        ("BOX", (0, 0), (-1, -1), 0.4, HexColor("#CBD5E1")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def _header_footer(canvas, doc, font: str, font_b: str, is_cover: bool) -> None:
    canvas.saveState()
    w, h = A4
    if not is_cover:
        canvas.setFillColor(PALETTE["cover"])
        canvas.rect(0, h - 1.15 * cm, w, 1.15 * cm, fill=1, stroke=0)
        canvas.setFillColor(HexColor("#B91C1C"))
        canvas.rect(0, h - 1.15 * cm, 0.18 * cm, 1.15 * cm, fill=1, stroke=0)
        canvas.setFillColor(white)
        canvas.setFont(font, 7.5)
        canvas.drawString(2 * cm, h - 0.72 * cm, "Relatório de Auditoria de Segurança — ForceQA")
        canvas.setFillColor(HexColor("#94A3B8"))
        canvas.setFont(font, 7.5)
        canvas.drawRightString(w - 2 * cm, h - 0.72 * cm, "Confidencial — uso interno")
    canvas.setFillColor(PALETTE["paper"])
    canvas.rect(0, 0, w, 1.15 * cm, fill=1, stroke=0)
    canvas.setStrokeColor(PALETTE["line"])
    canvas.setLineWidth(0.4)
    canvas.line(2 * cm, 1.15 * cm, w - 2 * cm, 1.15 * cm)
    canvas.setFillColor(PALETTE["muted"])
    canvas.setFont(font, 7.5)
    canvas.drawString(2 * cm, 0.5 * cm, AUDIT_DATE.strftime("%d/%m/%Y"))
    canvas.drawRightString(w - 2 * cm, 0.5 * cm, f"Página {doc.page}")
    canvas.restoreState()


def build_story(styles: dict, donut: Path, bars: Path) -> list:
    story: list = []
    usable = 17 * cm

    # ---- CAPA (conteúdo; fundo desenhado em onFirstPage) ----
    story.append(Spacer(1, 4.6 * cm))
    story.append(Paragraph("AUDITORIA DE APLICAÇÃO WEB", styles["cover_kicker"]))
    story.append(Paragraph(
        f"Relatório de Auditoria de Segurança — {PROJECT}",
        styles["cover_title"],
    ))
    story.append(Paragraph(
        "Cinco categorias mapeadas para a stack real: RLS/tenant, gates de papel, "
        "IDOR nas rotas, segredos no código e XSS.",
        styles["cover_sub"],
    ))
    story.append(Spacer(1, 1.2 * cm))

    meta = [
        [Paragraph("<b>Data</b>", styles["small"]),
         Paragraph(AUDIT_DATE.strftime("%d de %B de %Y").replace("August", "agosto"), styles["small"])],
        [Paragraph("<b>Projeto</b>", styles["small"]),
         Paragraph("ForceQA (repositório force-qa)", styles["small"])],
        [Paragraph("<b>Escopo</b>", styles["small"]),
         Paragraph(_esc(SCOPE), styles["small"])],
        [Paragraph("<b>Método</b>", styles["small"]),
         Paragraph(
             "Achados somente com evidência no código (arquivo:linha). "
             "Handlers de API percorridos na íntegra (10 rotas). "
             "O que está correto entra em Pontos fortes.",
             styles["small"],
         )],
    ]
    meta_t = Table(meta, colWidths=[3.2 * cm, 10.5 * cm])
    meta_t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#111827")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, HexColor("#1F2937")),
        ("TEXTCOLOR", (0, 0), (-1, -1), white),
    ]))
    # Re-style paragraphs on cover meta to light text
    cover_small = ParagraphStyle(
        "cover_small", parent=styles["small"], textColor=HexColor("#E2E8F0"),
    )
    cover_small_b = ParagraphStyle(
        "cover_small_b", parent=styles["small"], fontName="DejaVu-Bold", textColor=white,
    )
    meta = [
        [Paragraph("Data", cover_small_b),
         Paragraph("28 de agosto de 2026", cover_small)],
        [Paragraph("Projeto", cover_small_b),
         Paragraph("ForceQA (repositório force-qa)", cover_small)],
        [Paragraph("Escopo", cover_small_b),
         Paragraph(_esc(SCOPE), cover_small)],
        [Paragraph("Método", cover_small_b),
         Paragraph(
             "Somente achados verificados no código (arquivo:linha). "
             "Os 10 handlers de API foram lidos por completo. "
             "Controles corretos estão na seção Pontos fortes.",
             cover_small,
         )],
    ]
    meta_t = Table(meta, colWidths=[3.2 * cm, 10.8 * cm])
    meta_t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#111827")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, HexColor("#1F2937")),
    ]))
    story.append(meta_t)
    story.append(Spacer(1, 1.4 * cm))
    story.append(Paragraph("<b>Nota metodológica — mapeamento das categorias</b>", styles["cover_sub"]))
    story.append(Spacer(1, 0.25 * cm))
    mapping = (
        "<b>1. Banco sem tranca</b> → RLS Postgres (mecanismo de isolamento do projeto: "
        "<font name='DejaVu-Mono' size='8'>organization_id</font> + "
        "<font name='DejaVu-Mono' size='8'>is_room_member()</font> / "
        "<font name='DejaVu-Mono' size='8'>can_admin_org()</font>; superadmin atravessa). "
        "Não há ORM; o client usa PostgREST.<br/>"
        "<b>2. Permissão no navegador</b> → cruzar "
        "<font name='DejaVu-Mono' size='8'>src/lib/permissions.ts</font> e gates em "
        "App.tsx com <font name='DejaVu-Mono' size='8'>requireAdmin</font> / "
        "<font name='DejaVu-Mono' size='8'>requireSuperadmin</font> / RLS.<br/>"
        "<b>3. IDOR</b> → todos os handlers em <font name='DejaVu-Mono' size='8'>api-src/</font> "
        "e <font name='DejaVu-Mono' size='8'>server.ts</font>, mais policies de UPDATE por id.<br/>"
        "<b>4. Chaves expostas</b> → código, .env.example, vercel.json, git log, ausência de "
        "Docker/Helm/CI. Anon key no Vite é esperada.<br/>"
        "<b>5. XSS</b> → React 19; busca de dangerouslySetInnerHTML/eval; href/src de usuário; "
        "e-mails só via Supabase Auth (sem HTML próprio)."
    )
    story.append(Paragraph(mapping, styles["cover_sub"]))
    story.append(PageBreak())

    # ---- RESUMO ----
    story.append(Paragraph("1. Resumo executivo", styles["h1"]))
    sev_c = _count_by("sev")
    total = len(FINDINGS)
    story.append(Paragraph(
        f"Foram confirmados <b>{total} achados</b> no código: "
        f"<b>{sev_c.get('crítica', 0)}</b> crítica, "
        f"<b>{sev_c.get('alta', 0)}</b> alta, "
        f"<b>{sev_c.get('média', 0)}</b> média, "
        f"<b>{sev_c.get('baixa', 0)}</b> baixa e "
        f"<b>{sev_c.get('informativa', 0)}</b> informativa. "
        f"O risco central é a policy <font name='DejaVu-Mono' size='8'>users_update</font> "
        f"permitir auto-promoção a superadmin (F-01), o que zera o isolamento multi-tenant. "
        f"Em seguida, guest sem autenticação na validação de sala e storage público de evidências.",
        styles["body"],
    ))

    kpi_data = []
    kpi_row = []
    for label, key, color in [
        ("Crítica", "crítica", PALETTE["critica"]),
        ("Alta", "alta", PALETTE["alta"]),
        ("Média", "média", PALETTE["media"]),
        ("Baixa", "baixa", PALETTE["baixa"]),
        ("Info", "informativa", PALETTE["informativa"]),
    ]:
        inner = Table(
            [[Paragraph(str(sev_c.get(key, 0)), ParagraphStyle(
                f"kpi_{key}", fontName="DejaVu-Bold", fontSize=16, textColor=white, alignment=TA_CENTER,
            ))],
             [Paragraph(label, ParagraphStyle(
                 f"kpl_{key}", fontName="DejaVu", fontSize=7, textColor=white, alignment=TA_CENTER,
             ))]],
            colWidths=[2.9 * cm],
        )
        inner.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), color),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        kpi_row.append(inner)
    kpi = Table([kpi_row], colWidths=[3.4 * cm] * 5)
    kpi.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(kpi)
    story.append(Spacer(1, 0.45 * cm))

    img_row = Table(
        [[Image(str(donut), width=8.2 * cm, height=5.1 * cm),
          Image(str(bars), width=8.4 * cm, height=4.6 * cm)]],
        colWidths=[8.5 * cm, 8.5 * cm],
    )
    img_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    story.append(img_row)
    story.append(Paragraph(
        "Figura 1 — Distribuição por severidade (rosca) e por categoria adaptada à stack (barras).",
        styles["caption"],
    ))

    story.append(Paragraph("Stack detectada", styles["h2"]))
    stack_bits = [
        "<b>Frontend:</b> React 19 + Vite 6 + TypeScript + Tailwind 4 (<font name='DejaVu-Mono' size='8'>src/</font>).",
        "<b>Auth:</b> Supabase Auth (JWT Bearer nas APIs). Anon key no browser.",
        "<b>Banco / isolamento:</b> Postgres + RLS. Tenant = <font name='DejaVu-Mono' size='8'>users.organization_id</font>. Superadmin = <font name='DejaVu-Mono' size='8'>users.is_superadmin</font>.",
        "<b>Acesso a dados:</b> PostgREST via @supabase/supabase-js; service_role só no servidor (<font name='DejaVu-Mono' size='8'>getSupabaseAdmin()</font>). Sem ORM.",
        "<b>Backend:</b> 10 rotas POST em <font name='DejaVu-Mono' size='8'>api-src/</font> (Vercel) espelhadas em <font name='DejaVu-Mono' size='8'>server.ts</font> no dev.",
        "<b>Deploy:</b> Vercel (<font name='DejaVu-Mono' size='8'>vercel.json</font>). Sem Docker, Helm, Terraform ou GitHub Actions neste repositório.",
        "<b>SQL:</b> <font name='DejaVu-Mono' size='8'>supabase/00_run_order.sql</font> itens 1–13; isolamento efetivo na migration 11.",
    ]
    for b in stack_bits:
        story.append(Paragraph("• " + b, styles["bullet"]))
    story.append(Paragraph(
        "Não há Docker/Helm/Terraform/CI neste repo (categoria de defaults em charts não se aplica). "
        "E-mails de convite passam pelo Auth da Supabase, sem HTML próprio. "
        "Não há dist/ no workspace; a análise das VITE_* foi na fonte. "
        "Revisão estática — sem teste dinâmico em produção.",
        styles["muted"],
    ))

    # ---- FORTES / FRACOS ----
    story.append(Paragraph("2. Pontos fortes e pontos fracos", styles["h1"]))
    story.append(Paragraph("Pontos fortes (verificados)", styles["h2"]))
    story.append(Paragraph(
        "Estes controles foram lidos no código e estão corretos no recorte indicado. "
        "Servem como prova de cobertura da auditoria, não como ausência de risco residual.",
        styles["muted"],
    ))
    for title, body in STRENGTHS:
        block = [
            Paragraph(f"<font color='#059669'><b>✓</b></font>  <b>{_esc(title)}</b>", styles["body_left"]),
            Paragraph(_esc(body), styles["muted"]),
        ]
        story.append(KeepTogether(block))

    story.append(Paragraph("Pontos fracos (riscos centrais)", styles["h2"]))
    weaks = [
        "O isolamento multi-tenant inteiro depende de <b>is_superadmin</b> e <b>organization_id</b> na tabela users, mas o próprio usuário pode gravar os dois (F-01, F-02).",
        "Guest é um caminho intencional de produto que <b>atravessa o tenant</b> e ainda enumera salas sem login (F-04).",
        "Evidências de QA (screenshots) não são um segredo por sessão — o bucket é público (F-05).",
        "Gates de admin nas APIs próprias estão bons; o furo de privilégio está no <b>PostgREST direto</b>, que o frontend usa para quase tudo.",
        "XSS clássico está controlado; o gap é <b>URL em href</b> (F-10).",
    ]
    for w in weaks:
        story.append(Paragraph("• " + w, styles["bullet"]))

    idor_heading = Paragraph("Cobertura IDOR — handlers de API", styles["h2"])
    idor_intro = Paragraph(
        "Todas as rotas em api-src/ (15 arquivos TypeScript, 10 handlers HTTP) foram lidas. "
        "Mutações de Kanban/bugs/salas no client passam só por RLS (não há handler próprio).",
        styles["muted"],
    )
    h_rows = [[
        Paragraph("<b>Rota</b>", styles["cell_b"]),
        Paragraph("<b>Auth / posse</b>", styles["cell_b"]),
    ]]
    for route, note in HANDLERS:
        h_rows.append([
            Paragraph(_esc(route), styles["cell"]),
            Paragraph(_esc(note), styles["cell"]),
        ])
    ht = Table(h_rows, colWidths=[6.2 * cm, 10.8 * cm], repeatRows=1)
    ht.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor("#0F172A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("BACKGROUND", (0, 1), (-1, -1), HexColor("#F8FAFC")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#F8FAFC"), white]),
        ("GRID", (0, 0), (-1, -1), 0.3, PALETTE["line"]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    # header cells need white text - Paragraphs already dark. Rebuild header with white style.
    hdr = ParagraphStyle("hdrw", parent=styles["cell_b"], textColor=white)
    h_rows[0] = [Paragraph("Rota", hdr), Paragraph("Auth / posse", hdr)]
    ht = Table(h_rows, colWidths=[6.2 * cm, 10.8 * cm], repeatRows=1)
    ht.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor("#0F172A")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#F8FAFC"), white]),
        ("GRID", (0, 0), (-1, -1), 0.3, PALETTE["line"]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(KeepTogether([idor_heading, idor_intro, ht]))

    # ---- TABELA RESUMO ----
    story.append(Paragraph("3. Achados detalhados por categoria", styles["h1"]))
    story.append(Paragraph(
        "Tabela-índice. O detalhe arquivo:linha, trecho e exploração segue na sequência, "
        "agrupado por categoria.",
        styles["muted"],
    ))

    t_rows = [[
        Paragraph("Sev.", hdr),
        Paragraph("ID", hdr),
        Paragraph("Arquivo:linha", hdr),
        Paragraph("Descrição", hdr),
    ]]
    for f in FINDINGS:
        t_rows.append([
            _chip_table(f["sev"], styles),
            Paragraph(f["id"], styles["cell_b"]),
            Paragraph(_esc(f"{f['file']}:{f['lines']}"), styles["cell"]),
            Paragraph(_esc(f["title"]), styles["cell"]),
        ])
    summary = Table(t_rows, colWidths=[2.6 * cm, 1.4 * cm, 6.2 * cm, 6.8 * cm], repeatRows=1)
    summary.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor("#0F172A")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#F8FAFC"), white]),
        ("GRID", (0, 0), (-1, -1), 0.3, PALETTE["line"]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ALIGN", (0, 1), (0, -1), "CENTER"),
    ]))
    story.append(summary)
    story.append(Spacer(1, 0.4 * cm))

    cats_seen: list[str] = []
    for f in FINDINGS:
        if f["cat"] not in cats_seen:
            cats_seen.append(f["cat"])
            story.append(Paragraph(f"Categoria: {f['cat']}", styles["h2"]))
        block = [
            Paragraph(f"{f['id']} — {_esc(f['title'])}", styles["h3"]),
            _chip_table(f["sev"], styles),
            Spacer(1, 0.12 * cm),
            Paragraph(f"<b>Onde:</b> {_esc(f['file'])}:{_esc(f['lines'])}", styles["body_left"]),
            Paragraph(f"<b>Por que é explorável:</b> {_esc(f['exploit'])}", styles["body"]),
            Paragraph(_esc(f["desc"]), styles["body"]),
            Paragraph("<b>Trecho</b>", styles["muted"]),
            _code_block(f["code"], styles),
        ]
        story.append(KeepTogether(block))

    # ---- RECOMENDAÇÕES ----
    story.append(Paragraph("4. Recomendações priorizadas", styles["h1"]))
    recs = [
        ("P1", "F-01 / F-02",
         "Travar is_superadmin e organization_id no banco (trigger + revoke de UPDATE amplo). "
         "Isso sozinho impede a queda total do modelo de tenants."),
        ("P1", "F-04",
         "Autenticar ou tokenizar validate-room; guest não deve herdar organization_id. "
         "Remover busca por nome (ILIKE)."),
        ("P1", "F-05 / F-08",
         "Bucket evidence privado, policies por prefixo de sala, URLs assinadas."),
        ("P1", "F-03",
         "Trigger de signup ignora user_metadata de org/role; guest só via API server-side."),
        ("P2", "F-06",
         "WITH CHECK em comments_update com is_room_member e war_room_id imutável."),
        ("P2", "F-07",
         "redirectTo allowlist (APP_URL); nunca Origin."),
        ("P2", "F-09",
         "requireAdmin/can_write_bugs + rate limit; relatório gera métricas no servidor."),
        ("P2", "F-10",
         "Allowlist https nas URLs de evidência + CHECK no Postgres."),
        ("P3", "F-11 / schema.sql",
         "REVOKE anon; não deixar policies USING(true) no bootstrap."),
        ("P3", "F-12",
         "Log de atividade deriva war_room_id do bug, não do client."),
        ("P3", "Operacional",
         "Confirmar no dashboard Supabase que as migrations 8–13 rodaram; schema.sql sozinho é inseguro."),
    ]
    r_hdr = [
        Paragraph("Pri.", hdr),
        Paragraph("Alvo", hdr),
        Paragraph("Ação", hdr),
    ]
    r_rows = [r_hdr]
    for pri, alvo, acao in recs:
        r_rows.append([
            Paragraph(f"<b>{pri}</b>", styles["cell_b"]),
            Paragraph(_esc(alvo), styles["cell"]),
            Paragraph(_esc(acao), styles["cell"]),
        ])
    rt = Table(r_rows, colWidths=[1.6 * cm, 3.4 * cm, 12 * cm], repeatRows=1)
    rt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor("#0F172A")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#F8FAFC"), white]),
        ("GRID", (0, 0), (-1, -1), 0.3, PALETTE["line"]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(rt)

    # ---- ISSUES ----
    story.append(PageBreak())
    story.append(Paragraph("5. Issues para o GitHub", styles["h1"]))
    story.append(Paragraph(
        "Cada bloco abaixo está pronto para colar numa issue. Achados triviais do mesmo "
        "tema foram agrupados para não gerar spam. Copie do delimitador "
        "<font name='DejaVu-Mono' size='8'>--- ISSUE n ---</font> até "
        "<font name='DejaVu-Mono' size='8'>--- FIM ISSUE n ---</font>.",
        styles["body"],
    ))

    issue_body_style = ParagraphStyle(
        "issue_body", parent=styles["small"], fontName="DejaVu-Mono", fontSize=8,
        leading=10.6, textColor=HexColor("#0F172A"),
    )

    for issue in ISSUES:
        n = issue["n"]
        md = (
            f"--- ISSUE {n} ---\n\n"
            f"# {issue['title']}\n\n"
            f"**Labels sugeridas:** `{issue['labels']}`\n\n"
            f"**Achados:** {', '.join(issue['findings'])}\n\n"
            f"{issue['body'].strip()}\n\n"
            f"--- FIM ISSUE {n} ---"
        )
        inner = Paragraph(_esc(md), issue_body_style)
        box = Table([[inner]], colWidths=[usable])
        box.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), HexColor("#F8FAFC")),
            ("BOX", (0, 0), (-1, -1), 0.6, HexColor("#CBD5E1")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(Paragraph(
            f"Issue {n} — {_esc(issue['title'])}  ·  labels: {issue['labels']}",
            styles["h3"],
        ))
        story.append(box)
        story.append(Spacer(1, 0.35 * cm))

    return story


def draw_cover(canvas, doc, font: str, font_b: str) -> None:
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(PALETTE["cover"])
    canvas.rect(0, 0, w, h, fill=1, stroke=0)
    canvas.setFillColor(PALETTE["critica"])
    canvas.rect(0, 0, 0.35 * cm, h, fill=1, stroke=0)
    canvas.setFillColor(HexColor("#111827"))
    canvas.rect(0, h - 3.2 * cm, w, 3.2 * cm, fill=1, stroke=0)
    canvas.setFillColor(white)
    canvas.setFont(font, 8)
    canvas.drawString(2 * cm, h - 1.3 * cm, "FORCEQA  ·  SEGURANÇA DE APLICAÇÃO")
    canvas.setFont(font_b, 9)
    canvas.drawRightString(w - 2 * cm, h - 1.3 * cm, "rev. 2026-08-28")
    _header_footer(canvas, doc, font, font_b, is_cover=True)
    canvas.restoreState()


def draw_later(canvas, doc, font: str, font_b: str) -> None:
    _header_footer(canvas, doc, font, font_b, is_cover=False)


def main() -> None:
    mpl_cache = ROOT / "_charts" / "mpl"
    mpl_cache.mkdir(parents=True, exist_ok=True)
    import os as _os
    _os.environ.setdefault("MPLCONFIGDIR", str(mpl_cache))
    font, font_b, mono = _register_fonts()
    styles = _styles(font, font_b, mono)
    donut, bars = _make_charts()
    story = build_story(styles, donut, bars)

    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=1.7 * cm,
        bottomMargin=1.6 * cm,
        title=f"Relatório de Auditoria de Segurança — {PROJECT}",
        author="Auditoria estática ForceQA",
        subject="RLS, IDOR, authz, segredos, XSS",
    )
    doc.build(
        story,
        onFirstPage=lambda c, d: draw_cover(c, d, font, font_b),
        onLaterPages=lambda c, d: draw_later(c, d, font, font_b),
    )
    print(f"PDF escrito em {PDF_PATH}")


if __name__ == "__main__":
    main()
