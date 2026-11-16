// اجراکننده صف هوش مصنوعی درون سرویس پس‌زمینه: برداشت کار با سقف هم‌زمانی تنظیمات، ضربان (heartbeat) برای
// نمایش سلامت در رابط کاربری، و بازگرداندن کارهای ناتمام پس از توقف ناگهانی.
import { getAiSettings } from "../server/ai/config";
import { claimJobs, executeJob, recoverStaleJobs, requeueJobs, writeHeartbeat } from "../server/ai/jobs";
import "../server/ai/handlers";

const HEARTBEAT_EVERY_MS = 15_000;
const RECOVER_EVERY_MS = 60_000;
const STOP_WAIT_MS = 20_000;

export interface AiRunner {
  stop(): Promise<void>;
  runningCount(): number;
}

const errText = (e: unknown): unknown => (e instanceof Error ? e.message : e);

export function startAiRunner(pollMs: number): AiRunner {
  const running = new Map<string, Promise<void>>();
  const startedAt = new Date().toISOString();
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let lastHeartbeat = 0;
  let lastRecover = 0;

  const runJob = async (id: string): Promise<void> => {
    try {
      const status = await executeJob(id);
      console.log(`[worker] AI job ${id} → ${status}`);
    } catch (e) {
      console.error("[worker] AI job crashed", id, errText(e));
    } finally {
      running.delete(id);
    }
  };

  const tick = async (): Promise<void> => {
    const now = Date.now();
    if (now - lastHeartbeat >= HEARTBEAT_EVERY_MS) {
      lastHeartbeat = now;
      await writeHeartbeat({ startedAt, running: running.size, pid: process.pid });
    }
    const settings = await getAiSettings();
    if (now - lastRecover >= RECOVER_EVERY_MS) {
      lastRecover = now;
      const n = await recoverStaleJobs(settings.timeoutSec);
      if (n) console.log(`[worker] recovered ${n} stale AI job(s)`);
    }
    if (!settings.enabled || stopped) return;
    const ids = await claimJobs(settings.concurrency - running.size);
    ids.forEach((id) => running.set(id, runJob(id)));
  };

  const loop = async (): Promise<void> => {
    try {
      await tick();
    } catch (e) {
      console.error("[worker] AI tick failed", errText(e));
    }
    if (!stopped) timer = setTimeout(() => void loop(), pollMs);
  };
  timer = setTimeout(() => void loop(), pollMs);

  return {
    runningCount: () => running.size,
    async stop(): Promise<void> {
      stopped = true;
      if (timer) clearTimeout(timer);
      const pending = [...running.values()];
      await Promise.race([Promise.allSettled(pending), new Promise((res) => setTimeout(res, STOP_WAIT_MS))]);
      await requeueJobs([...running.keys()]);
    },
  };
}
