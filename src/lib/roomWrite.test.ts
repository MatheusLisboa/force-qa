import { describe, expect, it } from "vitest";
import { resolveRoomWrite } from "./roomWrite";

describe("resolveRoomWrite", () => {
  it("papel que escreve pode, sem motivo de bloqueio", () => {
    expect(resolveRoomWrite({ role: "qa" })).toEqual({ canWrite: true, reason: null });
    expect(resolveRoomWrite({ role: "developer" })).toEqual({ canWrite: true, reason: null });
  });

  it("viewer não pode e recebe explicação sobre a permissão", () => {
    const decision = resolveRoomWrite({ role: "viewer" });
    expect(decision.canWrite).toBe(false);
    expect(decision.reason).toMatch(/Escrever cards/);
  });

  it("somente leitura na sala vence o papel", () => {
    const decision = resolveRoomWrite({ role: "qa", memberReadOnly: true });
    expect(decision.canWrite).toBe(false);
    expect(decision.reason).toMatch(/somente leitura nesta sala/);
  });

  it("convidado só escreve se a sala liberou", () => {
    expect(resolveRoomWrite({ role: "viewer", isGuest: true, guestPermission: "write" }).canWrite).toBe(true);
    const blocked = resolveRoomWrite({ role: "viewer", isGuest: true, guestPermission: "read" });
    expect(blocked.canWrite).toBe(false);
    expect(blocked.reason).toMatch(/Convidados só leem e comentam/);
    expect(resolveRoomWrite({ role: "viewer", isGuest: true }).canWrite).toBe(false);
  });

  it("convidado liberado ainda respeita o somente leitura", () => {
    expect(resolveRoomWrite({ isGuest: true, guestPermission: "write", memberReadOnly: true }).canWrite).toBe(false);
  });

  it("papel de convidado (mesmo 'qa' por engano) não vale: vale a sala", () => {
    expect(resolveRoomWrite({ role: "qa", isGuest: true, guestPermission: "read" }).canWrite).toBe(false);
  });

  it("superadmin sempre pode, até com somente leitura marcado", () => {
    expect(resolveRoomWrite({ role: "viewer", isSuperadmin: true, memberReadOnly: true }).canWrite).toBe(true);
  });
});
