#!/usr/bin/env bash
# Auditoria de RLS: aplica as migrations num Postgres descartável e roda supabase/tests/*.sql.
#
# Uso:
#   npm run test:rls                       # sobe um Postgres temporário (precisa de postgresql instalado)
#   RLS_DATABASE_URL=postgres://... npm run test:rls   # usa um servidor existente (ex.: serviço do CI)
#
# Nunca aponte para o banco de produção: o script recria o schema "public".
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN=""
for dir in /opt/homebrew/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@17/bin /usr/lib/postgresql/16/bin /usr/lib/postgresql/17/bin /usr/local/bin; do
  [ -x "$dir/initdb" ] && PG_BIN="$dir" && break
done

TMP=""
cleanup() {
  if [ -n "$TMP" ] && [ -n "$PG_BIN" ]; then
    "$PG_BIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true
    rm -rf "$TMP"
  fi
}
trap cleanup EXIT

if [ -n "${RLS_DATABASE_URL:-}" ]; then
  URL="$RLS_DATABASE_URL"
  case "$URL" in
    *supabase.co*) echo "Recusado: RLS_DATABASE_URL aponta para o Supabase real." >&2; exit 2 ;;
  esac
else
  if [ -z "$PG_BIN" ]; then
    echo "PostgreSQL não encontrado. Instale (brew install postgresql@16) ou defina RLS_DATABASE_URL." >&2
    exit 2
  fi
  TMP="$(mktemp -d)"
  PORT=$((20000 + RANDOM % 20000))
  "$PG_BIN/initdb" -D "$TMP/data" -A trust -U postgres >/dev/null
  "$PG_BIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l "$TMP/pg.log" -w start >/dev/null
  URL="postgres://postgres@127.0.0.1:$PORT/postgres"
fi

PSQL=(psql "$URL" -v ON_ERROR_STOP=1 -q -X)

echo "→ preparando banco"
# Zera tudo que os testes tocam (inclusive as peças simuladas do Supabase), para rodar de forma idempotente.
"${PSQL[@]}" -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS rls_test CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE; DROP SCHEMA IF EXISTS extensions CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;" >/dev/null 2>&1 || true
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stubs.sql"

echo "→ aplicando migrations"
# Cada arquivo vai numa única mensagem (psql -c), como o SQL Editor e o Supabase CLI:
# assim LOCK TABLE etc. rodam na transação implícita do arquivo.
for f in "$ROOT"/supabase/migrations/*.sql; do
  # SKIP_MIGRATIONS="000021 000020": teste de mutação (prova que o teste pega a falta da correção).
  skip=0; for pat in ${SKIP_MIGRATIONS:-}; do case "$f" in *"$pat"*) skip=1;; esac; done
  [ $skip -eq 1 ] && { echo "   (pulando $(basename "$f"))"; continue; }
  if ! out="$(psql "$URL" -v ON_ERROR_STOP=1 -q -X -c "$(cat "$f")" 2>&1)"; then
    echo "falha em $(basename "$f"):" >&2
    echo "$out" >&2
    exit 1
  fi
done

status=0
for t in "$ROOT"/supabase/tests/[1-9]*.sql; do
  [ -e "$t" ] || continue
  echo "→ $(basename "$t")"
  if ! "${PSQL[@]}" -f "$t"; then status=1; fi
done

[ $status -eq 0 ] && echo "✓ RLS ok" || echo "✗ RLS com falhas" >&2
exit $status
