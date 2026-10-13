import { canWriteBugs } from "./permissions";
import type { GuestPermission } from "./roomAccess";

export interface RoomWriteDecision {
  canWrite: boolean;
  /** Pode destravar a escrita entrando na sala (sala visível à organização e a pessoa ainda não é membro). */
  joinable?: boolean;
  /** Por que não pode (texto para a interface); null quando pode. */
  reason: string | null;
}

/**
 * Pode criar/editar cards NESTA sala? Espelha a função can_write_in_room do banco:
 * superadmin sempre; "somente leitura" da sala restringe; convidado vale o que a sala liberou;
 * os demais seguem o papel. (O banco é quem de fato impede; isto só evita botões que falhariam.)
 */
export function resolveRoomWrite(params: {
  role?: string | null;
  isSuperadmin?: boolean;
  isGuest?: boolean;
  guestPermission?: GuestPermission;
  memberReadOnly?: boolean;
  /** Vê a sala por ela ser visível à organização, mas não é membro. Admin da organização escreve sem ser membro. */
  notMember?: boolean;
}): RoomWriteDecision {
  if (params.isSuperadmin) return { canWrite: true, reason: null };
  // Só oferece "entrar" a quem, entrando, passaria a escrever; quem não tem a permissão de escrever segue ao motivo do papel.
  if (params.notMember && !params.isGuest && params.role !== "admin" && canWriteBugs(params.role, false, false)) {
    return {
      canWrite: false,
      joinable: true,
      reason: "Você vê esta sala porque ela é visível a toda a organização: pode ler e comentar. Entre na sala para criar e editar cards.",
    };
  }
  if (params.memberReadOnly) {
    return { canWrite: false, reason: "Você está como somente leitura nesta sala. Peça a um admin para liberar a edição." };
  }
  if (params.isGuest) {
    return params.guestPermission === "write"
      ? { canWrite: true, reason: null }
      : { canWrite: false, reason: "Convidados só leem e comentam nesta sala. Um admin pode liberar a criação de cards." };
  }
  if (canWriteBugs(params.role, false, false)) return { canWrite: true, reason: null };
  return {
    canWrite: false,
    reason: "O seu papel não tem a permissão \"Escrever cards\". Um admin pode ajustar isso em Permissões.",
  };
}
