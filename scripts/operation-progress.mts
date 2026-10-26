import { formatSeconds } from '@polyspec/kit/run-command';

/** Report operation steps and elapsed time without producing test results. */
export function createOperationProgress({ write }: { write: (text: string) => void }) {
  const started = performance.now();
  const active = new Map<string, number>();
  let completed = 0;
  let failed = 0;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const line = (text: string): void => write(`${text}\n`);
  const stopHeartbeat = (): void => {
    clearInterval(heartbeat);
    heartbeat = undefined;
  };
  const finish = (id: string, outcome: string, elapsedMs?: number, detail?: string): void => {
    const began = active.get(id);
    if (began === undefined) throw new Error(`Operation ${id}: expected a started operation, actual: no start`);
    active.delete(id);
    completed += 1;
    line(`${outcome} ${id} (${formatSeconds(elapsedMs ?? performance.now() - began)})`);
    if (detail) line(detail);
    if (active.size === 0) stopHeartbeat();
  };
  return {
    line,
    start(id: string): void {
      active.set(id, performance.now());
      line(`▶ ${id}`);
      heartbeat ??= setInterval(() => {
        for (const [name, began] of active) line(`… ${name} (${formatSeconds(performance.now() - began)})`);
      }, 5000);
      heartbeat.unref();
    },
    pass(id: string, elapsedMs?: number): void { finish(id, '✔', elapsedMs); },
    fail(id: string, elapsedMs?: number, detail?: string): void {
      failed += 1;
      finish(id, '✖', elapsedMs, detail);
    },
    close(name: string): void {
      stopHeartbeat();
      line(`${name}: ${completed} operations, ${failed} failed (${formatSeconds(performance.now() - started)})`);
    },
  };
}
