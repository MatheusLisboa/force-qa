import { describe, expect, it } from "vitest";
import { runBulk } from "./bulkActions";

describe("runBulk", () => {
  it("processa todos e separa sucesso de falha", async () => {
    const result = await runBulk(["a", "b", "c", "d"], async (id) => {
      if (id === "b" || id === "d") throw new Error("falhou " + id);
    });
    expect(result.ok.sort()).toEqual(["a", "c"]);
    expect(result.failed.map((f) => f.id).sort()).toEqual(["b", "d"]);
  });

  it("respeita o limite de concorrência", async () => {
    let running = 0;
    let peak = 0;
    await runBulk(Array.from({ length: 10 }, (_, i) => String(i)), async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    }, 3);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("lista vazia não faz nada", async () => {
    expect(await runBulk([], async () => {})).toEqual({ ok: [], failed: [] });
  });
});
