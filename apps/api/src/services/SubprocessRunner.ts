import { AsyncLocalStorage } from "node:async_hooks";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { AppError } from "../errors/AppError.js";

const signals = new AsyncLocalStorage<AbortSignal | undefined>();

export function withConversionSignal<T>(signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
  return signals.run(signal, task);
}

export function assertConversionActive(): void {
  const signal = signals.getStore();
  if (signal?.aborted) throw signal.reason;
}

export async function runCommand(command: string, args: string[], options: { timeout?: number; maxBuffer?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  const signal = signals.getStore();
  if (signal?.aborted) throw signal.reason;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let terminationReason: Error | null = null;
    let hardKill: NodeJS.Timeout | undefined;
    const limit = options.maxBuffer ?? 10 * 1024 * 1024;
    let outputLimitReached = false;
    const signalGroup = (signalName: NodeJS.Signals) => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signalName);
        else child.kill(signalName);
      } catch { /* process group may already have exited */ }
    };
    const groupAlive = () => {
      if (process.platform === "win32" || !child.pid) return false;
      try { process.kill(-child.pid, 0); return true; } catch { return false; }
    };
    const finishGroup = async () => {
      signalGroup("SIGKILL");
      for (let attempt = 0; attempt < 40 && groupAlive(); attempt += 1) await delay(50);
      if (groupAlive()) throw new AppError(502, "Processo de conversão não terminou após cancelamento.", "OMR_PROCESS_TREE_NOT_TERMINATED");
    };
    const killTree = (reason: Error) => {
      if (terminationReason) return;
      terminationReason = reason;
      signalGroup("SIGTERM");
      hardKill = setTimeout(() => signalGroup("SIGKILL"), 2_000);
      hardKill.unref();
    };
    const onAbort = () => killTree(signal?.reason instanceof Error ? signal.reason : new AppError(504, "Conversão cancelada.", "OMR_CONVERSION_TIMEOUT"));
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = options.timeout ? setTimeout(() => killTree(new AppError(504, "Tempo máximo do processo excedido.", "OMR_CONVERSION_TIMEOUT")), options.timeout) : undefined;
    const append = (value: string, stream: "stdout" | "stderr") => {
      if (outputLimitReached) return;
      const remaining = Math.max(0, limit - stdout.length - stderr.length);
      const bounded = value.slice(0, remaining);
      if (stream === "stdout") stdout += bounded;
      else stderr += bounded;
      if (value.length > remaining) {
        outputLimitReached = true;
        killTree(new AppError(502, "Saída do processo excedeu o limite.", "OMR_OUTPUT_LIMIT"));
      }
    };
    child.stdout.on("data", (chunk: Buffer) => append(chunk.toString(), "stdout"));
    child.stderr.on("data", (chunk: Buffer) => append(chunk.toString(), "stderr"));
    child.once("error", (error) => { if (!terminationReason) terminationReason = error; });
    child.once("close", async (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      try {
        if (terminationReason || groupAlive()) await finishGroup();
        if (hardKill) clearTimeout(hardKill);
        if (terminationReason) { Object.assign(terminationReason, { stdout, stderr }); reject(terminationReason); }
        else if (code !== 0) reject(Object.assign(new AppError(502, `Processo encerrou com código ${code}.`, "OMR_PROCESS_EXIT"), { stdout, stderr }));
        else resolve({ stdout, stderr });
      } catch (error) {
        if (hardKill) clearTimeout(hardKill);
        reject(error);
      }
    });
  });
}
