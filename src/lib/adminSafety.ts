import type { UserProfile } from "../types";

type AdminLike = Pick<UserProfile, "id" | "name" | "role" | "organizationId" | "isGuest">;

/** Admins "de verdade" da organização (convidado nunca conta, igual ao trigger do banco). */
export function adminsOfOrganization<T extends AdminLike>(users: T[], organizationId: string): T[] {
  return users.filter((user) => user.role === "admin" && !user.isGuest && user.organizationId === organizationId);
}

/** Tirar este usuário de admin (apagar, rebaixar, mover) deixaria a organização sem admin? */
export function isLastAdmin<T extends AdminLike>(users: T[], user: AdminLike): boolean {
  if (user.role !== "admin" || user.isGuest) return false;
  return adminsOfOrganization(users, user.organizationId).filter((admin) => admin.id !== user.id).length === 0;
}

/** Aviso quando a organização depende de uma única conta admin. */
export function singleAdminWarning<T extends AdminLike>(users: T[], organizationId: string): string | null {
  const admins = adminsOfOrganization(users, organizationId);
  if (admins.length !== 1) return null;
  return `Só ${admins[0].name || "uma conta"} é admin desta organização. Se essa conta se perder, ninguém consegue administrar usuários e salas. Promova pelo menos mais uma pessoa a Admin.`;
}

/** Mensagens do banco chegam como "last_admin: texto"; tira o código técnico. */
export function cleanAdminSafetyError(message: string): string {
  return message.replace(/^last_admin:\s*/i, "");
}
