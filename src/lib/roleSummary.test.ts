import { describe, expect, it } from "vitest";
import { cloneRoleMatrix, DEFAULT_ROLE_MATRIX } from "./permissions";
import { describeMatrixChange, diffMatrix, groupEquivalentRoles, summarizeRole } from "./roleSummary";

describe("groupEquivalentRoles", () => {
  it("na matriz padrão: QA = Scrum e Dev = DBA = DevOps", () => {
    const groups = groupEquivalentRoles(DEFAULT_ROLE_MATRIX);
    expect(groups).toContainEqual(["qa", "scrum_master"]);
    expect(groups).toContainEqual(["developer", "dba", "devops"]);
    expect(groups.flat()).not.toContain("viewer");
    expect(groups.flat()).not.toContain("admin");
  });

  it("deixa de agrupar quando uma permissão diferencia o papel", () => {
    const matrix = cloneRoleMatrix(DEFAULT_ROLE_MATRIX);
    matrix.dba.manage_views = true;
    const groups = groupEquivalentRoles(matrix);
    expect(groups).toContainEqual(["developer", "devops"]);
    expect(groups.flat()).not.toContain("dba");
  });
});

describe("diffMatrix / describeMatrixChange", () => {
  it("lista só o que mudou, em português", () => {
    const draft = cloneRoleMatrix(DEFAULT_ROLE_MATRIX);
    draft.qa.invite_members = false;
    draft.viewer.write_cards = true;
    const changes = diffMatrix(DEFAULT_ROLE_MATRIX, draft);
    expect(changes).toHaveLength(2);
    const text = changes.map(describeMatrixChange);
    expect(text).toContain("QA deixa de poder: Convidar");
    expect(text).toContain("Viewer passa a poder: Escrever cards");
  });

  it("sem mudança devolve vazio", () => {
    expect(diffMatrix(DEFAULT_ROLE_MATRIX, cloneRoleMatrix(DEFAULT_ROLE_MATRIX))).toEqual([]);
  });
});

describe("summarizeRole", () => {
  it("separa o que pode do que não pode", () => {
    const viewer = summarizeRole(DEFAULT_ROLE_MATRIX, "viewer");
    expect(viewer.can).toEqual([]);
    expect(viewer.cannot).toContain("Escrever cards");
    const dev = summarizeRole(DEFAULT_ROLE_MATRIX, "developer");
    expect(dev.can).toEqual(["Escrever cards", "Atribuir cards", "Usar IA"]);
    expect(dev.cannot).toContain("Usuários");
  });
});
