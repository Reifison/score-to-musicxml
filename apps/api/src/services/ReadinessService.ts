export type ReadinessChecks = { database: boolean; redis: boolean; worker: boolean };

async function bounded(task: () => Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(task).then((value) => Boolean(value), () => false),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkReadiness(tasks: { database: () => Promise<unknown>; redis: () => Promise<unknown>; worker: () => Promise<unknown> }, timeoutMs = 2_000): Promise<{ ok: boolean; checks: ReadinessChecks }> {
  const [database, redis, worker] = await Promise.all([
    bounded(tasks.database, timeoutMs),
    bounded(tasks.redis, timeoutMs),
    bounded(tasks.worker, timeoutMs)
  ]);
  const checks = { database, redis, worker };
  return { ok: database && redis && worker, checks };
}
