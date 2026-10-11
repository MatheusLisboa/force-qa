export interface BulkResult {
  ok: string[];
  failed: Array<{ id: string; error: unknown }>;
}

/** Roda `worker` para cada id com concorrência limitada; nunca lança, devolve sucessos e falhas. */
export async function runBulk(ids: string[], worker: (id: string) => Promise<void>, concurrency = 4): Promise<BulkResult> {
  const result: BulkResult = { ok: [], failed: [] };
  let next = 0;
  const lanes = Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        await worker(id);
        result.ok.push(id);
      } catch (error) {
        result.failed.push({ id, error });
      }
    }
  });
  await Promise.all(lanes);
  return result;
}
