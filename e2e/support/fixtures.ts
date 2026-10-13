/** Dados fictícios usados pelo Supabase simulado dos testes e dos screenshots. */

export const ORG_ID = "00000000-0000-0000-0000-000000000001";
export const USER_ID = "11111111-1111-1111-1111-111111111111";
export const ROOM_WAR = "22222222-2222-2222-2222-222222222201";
export const ROOM_BOARD = "22222222-2222-2222-2222-222222222202";
export const ROOM_ORG = "22222222-2222-2222-2222-222222222204";

const daysAgo = (days: number, hours = 0) => new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();

export function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    name: "Marina Souza",
    email: "marina@acme.dev",
    role: "admin",
    squad: "Pagamentos",
    organization_id: ORG_ID,
    is_superadmin: true,
    is_guest: false,
    avatar_url: null,
    created_at: daysAgo(90),
    ...overrides,
  };
}

export const rooms: Array<Record<string, unknown>> = [
  {
    id: ROOM_WAR,
    name: "Sprint 42: Checkout",
    project: "Loja Online",
    squad: "Pagamentos",
    date: daysAgo(1).slice(0, 10),
    period_end: null,
    description: "Sessão de QA do novo fluxo de checkout antes do release de sexta.",
    severity: "high",
    status: "active",
    room_type: "war_room",
    kanban_columns: null,
    created_at: daysAgo(2),
    created_by: USER_ID,
    created_by_name: "Marina Souza",
    guest_access_disabled: false,
    organization_id: ORG_ID,
  },
  {
    id: ROOM_BOARD,
    name: "Board permanente: App Mobile",
    project: "App Mobile",
    squad: "Mobile",
    date: daysAgo(30).slice(0, 10),
    period_end: null,
    description: "Backlog contínuo de bugs do aplicativo.",
    severity: "medium",
    status: "active",
    room_type: "board",
    kanban_columns: null,
    created_at: daysAgo(30),
    created_by: USER_ID,
    created_by_name: "Marina Souza",
    guest_access_disabled: false,
    organization_id: ORG_ID,
  },
  {
    id: "22222222-2222-2222-2222-222222222203",
    name: "Hotfix: Cálculo de frete",
    project: "Loja Online",
    squad: "Logística",
    date: daysAgo(12).slice(0, 10),
    period_end: null,
    description: "Sessão encerrada.",
    severity: "critical",
    status: "ended",
    room_type: "war_room",
    kanban_columns: null,
    created_at: daysAgo(12),
    created_by: USER_ID,
    created_by_name: "Marina Souza",
    guest_access_disabled: false,
    organization_id: ORG_ID,
  },
];

type BugSeed = [
  title: string,
  status: string,
  criticism: string,
  type: string,
  owner: string | null,
  ageDays: number,
  room?: string
];

const SEEDS: BugSeed[] = [
  ["Pagamento com Pix não confirma o pedido", "new", "blocker", "bug", null, 3],
  ["Cupom de desconto aplicado duas vezes", "new", "high", "bug", "Rafael Lima", 1],
  ["Botão \"Finalizar\" some em telas de 360px", "new", "medium", "ui_adjustment", "Camila Duarte", 0.2],
  ["Timeout ao calcular frete para CEPs do Norte", "under_analysis", "critical", "performance", "Rafael Lima", 4],
  ["Token de sessão aparece em logs do gateway", "under_analysis", "critical", "security", "Bruno Alves", 2],
  ["Resumo do pedido não mostra o parcelamento", "in_progress", "medium", "requirement", "Camila Duarte", 2],
  ["Erro 500 ao salvar endereço com complemento longo", "in_progress", "high", "bug", "Rafael Lima", 5],
  ["Ícone de carrinho desalinhado no header", "in_progress", "low", "ui_adjustment", "Camila Duarte", 1],
  ["E-mail de confirmação chega sem o número do pedido", "ready_for_qa", "high", "bug", "Bruno Alves", 6],
  ["Mensagem de erro do cartão recusado é genérica", "ready_for_qa", "medium", "improvement", "Camila Duarte", 3],
  ["Carrinho perde itens após login", "reopened", "high", "bug", "Rafael Lima", 8],
  ["Tela de sucesso não respeita o tema escuro", "validated", "low", "ihc", "Camila Duarte", 7],
  ["Validação de CPF aceita sequências repetidas", "validated", "medium", "bug", "Bruno Alves", 9],
];

// Visível a toda a organização, e a pessoa logada NÃO é membro (só vê).
rooms.push({
  id: ROOM_ORG,
  name: "Design System: Aberto",
  project: "Design System",
  squad: "Plataforma",
  date: daysAgo(5).slice(0, 10),
  period_end: null,
  description: "Sala aberta a toda a organização.",
  severity: "low",
  status: "active",
  room_type: "war_room",
  kanban_columns: null,
  created_at: daysAgo(5),
  created_by: "44444444-4444-4444-4444-000000000002",
  created_by_name: "Rafael Lima",
  guest_access_disabled: true,
  organization_id: ORG_ID,
  visibility: "organization",
});

export const bugs = SEEDS.map(([title, status, criticism, type, owner, ageDays], index) => ({
  id: `33333333-3333-3333-3333-${String(index + 1).padStart(12, "0")}`,
  war_room_id: ROOM_WAR,
  title,
  description: `${title}.\n\nPassos: abrir o checkout, preencher os dados e concluir a compra.`,
  criticism,
  status,
  kanban_column_id: null,
  evidence_url: null,
  prototype_url: null,
  owner_id: owner ? `44444444-4444-4444-4444-${String(index + 1).padStart(12, "0")}` : null,
  owner_name: owner,
  environment: "homologation",
  affected_url: null,
  build_version: "2.14.0-rc3",
  tags: [],
  priority: criticism === "blocker" ? "immediate" : criticism === "critical" || criticism === "high" ? "high" : "medium",
  type,
  attachments: [],
  duplicate_of_bug_id: null,
  repro_checklist: [],
  created_at: daysAgo(ageDays as number),
  updated_at: daysAgo(Math.max((ageDays as number) - 0.5, 0)),
  created_by: USER_ID,
  created_by_name: "Marina Souza",
  resolved_at: status === "validated" ? daysAgo(1) : null,
  reopen_count: status === "reopened" ? 1 : 0,
  archived: false,
}));

export const notifications = [
  {
    id: "55555555-5555-5555-5555-000000000001",
    user_id: USER_ID,
    type: "assignment",
    title: "Rafael atribuiu um card a você",
    body: "Pagamento com Pix não confirma o pedido",
    war_room_id: ROOM_WAR,
    bug_id: bugs[0].id,
    read_at: null,
    created_at: daysAgo(0, 1),
  },
  {
    id: "55555555-5555-5555-5555-000000000002",
    user_id: USER_ID,
    type: "mention",
    title: "Camila mencionou você",
    body: "@Marina pode validar o ajuste do ícone?",
    war_room_id: ROOM_WAR,
    bug_id: bugs[7].id,
    read_at: daysAgo(0, 5),
    created_at: daysAgo(0, 6),
  },
];

export const projects = [
  {
    id: "66666666-6666-6666-6666-000000000001",
    name: "App Mobile",
    slug: "app-mobile",
    squad: "Mobile",
    description: "Aplicativo iOS e Android",
    war_room_id: ROOM_BOARD,
    organization_id: ORG_ID,
    created_at: daysAgo(30),
    created_by: USER_ID,
  },
];

export const audit_events = [
  {
    id: 3,
    organization_id: ORG_ID,
    actor_id: USER_ID,
    actor_name: "Marina Souza",
    action: "room.visibility_changed",
    target_type: "room",
    target_id: ROOM_WAR,
    detail: { name: "Sprint 42: Checkout", from: "organization", to: "members" },
    created_at: daysAgo(0, 1),
  },
  {
    id: 2,
    organization_id: ORG_ID,
    actor_id: USER_ID,
    actor_name: "Marina Souza",
    action: "user.role_changed",
    target_type: "user",
    target_id: "44444444-4444-4444-4444-000000000002",
    detail: { name: "Rafael Lima", from: "developer", to: "qa" },
    created_at: daysAgo(1),
  },
  {
    id: 1,
    organization_id: ORG_ID,
    actor_id: USER_ID,
    actor_name: "Marina Souza",
    action: "integration.export_token_rotated",
    target_type: "organization",
    target_id: ORG_ID,
    detail: { rooms: 2 },
    created_at: daysAgo(3),
  },
];

export const orgUsers = [
  userRow(),
  userRow({ id: "44444444-4444-4444-4444-000000000002", name: "Rafael Lima", email: "rafael@acme.dev", role: "developer", squad: "Pagamentos", is_superadmin: false }),
  userRow({ id: "44444444-4444-4444-4444-000000000003", name: "Camila Duarte", email: "camila@acme.dev", role: "qa", squad: "Pagamentos", is_superadmin: false }),
  userRow({ id: "44444444-4444-4444-4444-000000000004", name: "Bruno Alves", email: "bruno@acme.dev", role: "scrum_master", squad: "Logística", is_superadmin: false }),
];

export const STORAGE_IMAGE = "https://e2e.supabase.test/storage/v1/object/public/evidence/room/print.png";

export const comments = [
  {
    id: "com-0001",
    bug_id: bugs[0].id,
    war_room_id: ROOM_WAR,
    user_id: orgUsers[1].id,
    user_name: "Rafael Lima",
    avatar_url: "",
    text: `Reproduzi em **homologação**. @Marina Souza veja o print:\n![print](${STORAGE_IMAGE})\n- erro 504 no gateway\n- veja https://status.acme.dev/incidente\n\n\`\`\`\nPOST /pix/confirm 504\n\`\`\``,
    created_at: daysAgo(0, 3),
  },
  {
    id: "com-0002",
    bug_id: bugs[0].id,
    war_room_id: ROOM_WAR,
    user_id: USER_ID,
    user_name: "Marina Souza",
    avatar_url: "",
    text: "<img src=x onerror=window.__xss=1> [clique](javascript:window.__xss=1)",
    created_at: daysAgo(0, 2),
  },
];

export const guestInvites = [
  { war_room_id: ROOM_WAR, token: "gst_FIXTURE_TOKEN_NAO_REAL_123456", expires_at: daysAgo(-6), created_at: daysAgo(1) },
];

export const roomMembers = [
  { war_room_id: ROOM_WAR, user_id: orgUsers[0].id, read_only: false },
  { war_room_id: ROOM_WAR, user_id: orgUsers[1].id, read_only: false },
  { war_room_id: ROOM_WAR, user_id: orgUsers[2].id, read_only: false },
];
