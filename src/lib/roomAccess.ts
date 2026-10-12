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

export type RoomVisibility = "organization" | "members";
export type GuestPermission = "write" | "read";

export const ROOM_VISIBILITY_LABEL: Record<RoomVisibility, { label: string; hint: string }> = {
  organization: {
    label: "Toda a organização",
    hint: "Qualquer pessoa da organização entra com o link ou o ID da sala.",
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

export function parseRoomVisibility(value: unknown): RoomVisibility {
  return value === "members" ? "members" : "organization";
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
