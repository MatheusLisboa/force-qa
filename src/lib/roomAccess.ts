export function diffRoomAccess(
  currentIds: string[],
  desiredIds: string[]
): { add: string[]; remove: string[] } {
  const current = new Set(currentIds);
  const desired = new Set(desiredIds);
  return {
    add: desiredIds.filter((id) => !current.has(id)),
    remove: currentIds.filter((id) => !desired.has(id)),
  };
}

/**
 * organization: listada e legível por toda a organização (quem não é membro lê e comenta);
 * link: só membros veem, mas qualquer pessoa da organização entra com o link/ID;
 * members: só quem for adicionado ou convidado.
 */
export type RoomVisibility = "organization" | "link" | "members";

/** Ordem de exibição, do mais aberto ao mais fechado. */
export const ROOM_VISIBILITY_OPTIONS: RoomVisibility[] = ["organization", "link", "members"];
export type GuestPermission = "write" | "read";

export const ROOM_VISIBILITY_LABEL: Record<RoomVisibility, { label: string; hint: string }> = {
  organization: {
    label: "Visível a toda a organização",
    hint: "Aparece na lista de todos da organização. Quem não é membro lê e comenta; para criar e editar cards, entra na sala.",
  },
  link: {
    label: "Só por link ou ID",
    hint: "Só os membros veem a sala na lista. Qualquer pessoa da organização entra com o link ou o ID.",
  },
  members: {
    label: "Somente membros",
    hint: "Só entra quem for adicionado ou convidado por um admin ou por quem tem permissão de convidar.",
  },
};

export const GUEST_PERMISSION_LABEL: Record<GuestPermission, { label: string; hint: string }> = {
  read: { label: "Ler e comentar", hint: "Convidados veem os cards e comentam, mas não criam nem editam." },
  write: { label: "Criar e editar cards", hint: "Convidados também criam e editam cards (útil para testadores externos)." },
};

/** Valor desconhecido ou ausente (banco antigo) = "link": é exatamente o comportamento de antes. */
export function parseRoomVisibility(value: unknown): RoomVisibility {
  return value === "organization" || value === "members" ? value : "link";
}

export function parseGuestPermission(value: unknown, fallback: GuestPermission = "write"): GuestPermission {
  return value === "read" ? "read" : value === "write" ? "write" : fallback;
}

/**
 * Pode esta pessoa entrar sozinha (por link/ID) numa sala da própria organização?
 * Já ser membro, ser admin da organização ou superadmin sempre pode; sala "somente membros" recusa o resto.
 */
export function canSelfJoinRoom(params: {
  visibility: RoomVisibility;
  isMember: boolean;
  isOrgAdmin: boolean;
  isSuperadmin: boolean;
}): { allowed: boolean; reason?: string } {
  if (params.isMember || params.isOrgAdmin || params.isSuperadmin) return { allowed: true };
  if (params.visibility === "members") {
    return {
      allowed: false,
      reason: "Esta sala é restrita a membros. Peça a um admin ou a quem criou a sala para te adicionar.",
    };
  }
  return { allowed: true };
}
