# Banco de dados (Supabase)

Fonte da verdade: [`migrations/`](migrations). Cada arquivo é aplicado **uma vez**, em ordem de nome
(`AAAAMMDDHHMMSS_descricao.sql`), pelo Supabase CLI.

## Fluxo normal

```bash
npm i -g supabase            # ou: npx supabase ...
supabase link --project-ref bdvpzgrgwgcvfgflelbn
supabase db push             # aplica só as migrations que ainda não rodaram
```

Nova mudança de schema: crie um arquivo novo (`supabase migration new nome_da_mudanca`), escreva o SQL
e rode `db push`. **Nunca edite uma migration já aplicada**; crie outra.

## Testar localmente (sem tocar na produção)

```bash
supabase start               # Postgres + Auth + Storage em Docker
supabase db reset            # recria o banco e reaplica todas as migrations
```

## Banco que já existia (primeira vez com o CLI)

Em produção as migrations antigas foram rodadas à mão no SQL Editor, então o histórico do CLI está
vazio e o `db push` tentaria reaplicar tudo. Marque as já aplicadas antes:

```bash
for v in 20260101000001 20260101000002 20260101000003 20260101000004 20260101000005 \
         20260101000006 20260101000007 20260101000008 20260101000009 20260101000010 \
         20260101000011 20260101000012 20260101000013 20260101000014 20260101000015 \
         20260101000016 20260101000017 20260101000018 20260101000019; do
  supabase migration repair --status applied $v
done
supabase db push             # aplica só a 20260101000020 (rate limit compartilhado)
```

Confira o que o banco realmente tem com `supabase migration list` antes de rodar o `repair`.

## Notas das migrations

| # | Arquivo | Para quê |
|---|---------|----------|
| 01 | `schema` | Tabelas base e RLS inicial |
| 02 | `auth_profile_trigger` | Perfil em `public.users` no signup (removido pela 19) |
| 03–07 | `projects`, `boards`, `board_views`, `kanban_columns`, `bug_types` | Projetos, boards, visões, colunas e tipos de card |
| 08 | `access_and_security` | Membership, evidências no Storage, trava de role. **Obrigatória** para convites, join e RLS de viewer |
| 09 | `room_access_ui` | Painel de membros e checkboxes em Usuários |
| 10–13 | `organizations`, `organization_scope`, `create_organization_admin`, `room_organization_from_creator` | Multi-organização; RLS e admin presos à org; superadmin atravessa |
| 14 | `security_hardening` | Trava `is_superadmin`/org, guest sem salto de tenant, bucket privado. **Obrigatória** |
| 15 | `session_ops` | Vários anexos, duplicata, checklist, webhook da org |
| 16 | `export_api` | Token SHA-256 para `GET /api/export/*` |
| 17 | `role_permissions` | Matriz de permissões editável (tela Permissões) |
| 18 | `guest_invite_lock` | Guest isolado; convite exige token |
| 19 | `public_signup` | Remove o trigger que abortava o Auth; o perfil vem da API |
| 20 | `rate_limits` | Contador de rate limit compartilhado entre instâncias serverless |

No painel do Supabase: **Authentication → Providers → Email → desmarque "Allow new users to sign up"**
(o cadastro no app usa a API admin, não o signup anônimo).

Se o SQL Editor/CLI retornar deadlock (`40P01`), espere 10 s e rode de novo: as migrations com
`COMMIT` + `LOCK TABLE` são idempotentes. Não rode duas ao mesmo tempo.
