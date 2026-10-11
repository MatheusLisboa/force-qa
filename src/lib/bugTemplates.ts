import type { BugType } from "../types";

/** Texto inicial da descrição por tipo de card: guia o que escrever sem impor formato. */
const TEMPLATES: Record<BugType, string> = {
  // Os passos/esperado/atual de bugs ficam no checklist de reprodução; aqui só o contexto.
  bug: "Contexto (usuário, dispositivo, build):\n\nImpacto para o usuário:\n",
  requirement: "Requisito:\n\nCritérios de aceite:\n- \n- \n\nImpacto se não for atendido:\n",
  ihc: "Tela ou fluxo:\n\nProblema de usabilidade observado:\n\nSugestão de melhoria:\n",
  product: "Contexto de produto:\n\nComportamento atual:\n\nComportamento desejado:\n",
  improvement: "Situação atual:\n\nMelhoria proposta:\n\nBenefício esperado:\n",
  ui_adjustment: "Tela / componente:\n\nO que está diferente do design:\n\nComo deveria ficar:\n",
  performance: "Onde é lento:\n\nMedição (tempo, requisições, dispositivo):\n\nMeta esperada:\n",
  security: "Vulnerabilidade ou risco:\n\nComo explorar (sem dados reais):\n\nImpacto:\n\nSugestão de correção:\n",
};

export function descriptionTemplate(type: BugType): string {
  return TEMPLATES[type] ?? "";
}

/** True se a descrição está vazia ou ainda é um dos modelos intocados (pode trocar sem perder texto). */
export function isUntouchedTemplate(description: string): boolean {
  const normalized = description.trim();
  if (!normalized) return true;
  return Object.values(TEMPLATES).some((template) => template.trim() === normalized);
}
