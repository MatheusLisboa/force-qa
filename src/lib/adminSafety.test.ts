import { describe, expect, it } from "vitest";
import { adminsOfOrganization, cleanAdminSafetyError, isLastAdmin, singleAdminWarning } from "./adminSafety";

const user = (id: string, role: string, organizationId = "A", isGuest = false) =>
  ({ id, name: id.toUpperCase(), role, organizationId, isGuest }) as never;

describe("adminSafety", () => {
  it("conta só admins reais da organização (sem convidado, sem outra org)", () => {
    const users = [user("a", "admin"), user("b", "admin", "B"), user("c", "admin", "A", true), user("d", "qa")];
    expect(adminsOfOrganization(users, "A").map((u: { id: string }) => u.id)).toEqual(["a"]);
  });

  it("detecta o último admin", () => {
    const users = [user("a", "admin"), user("d", "qa")];
    expect(isLastAdmin(users, users[0])).toBe(true);
    expect(isLastAdmin(users, users[1])).toBe(false);
  });

  it("com dois admins ninguém é o último", () => {
    const users = [user("a", "admin"), user("b", "admin")];
    expect(isLastAdmin(users, users[0])).toBe(false);
    expect(isLastAdmin(users, users[1])).toBe(false);
  });

  it("admin de outra organização não salva o último da sua", () => {
    const users = [user("a", "admin", "A"), user("x", "admin", "B")];
    expect(isLastAdmin(users, users[0])).toBe(true);
  });

  it("avisa quando há um único admin, e só nesse caso", () => {
    expect(singleAdminWarning([user("a", "admin")], "A")).toMatch(/Só A é admin/);
    expect(singleAdminWarning([user("a", "admin"), user("b", "admin")], "A")).toBeNull();
    expect(singleAdminWarning([user("d", "qa")], "A")).toBeNull();
  });

  it("limpa o prefixo técnico da mensagem do banco", () => {
    expect(cleanAdminSafetyError("last_admin: não é possível remover.")).toBe("não é possível remover.");
    expect(cleanAdminSafetyError("Outro erro")).toBe("Outro erro");
  });
});
