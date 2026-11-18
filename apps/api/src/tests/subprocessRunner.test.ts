import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { runCommand } from "../services/SubprocessRunner.js";

describe("SubprocessRunner", () => {
  it("encerra também o neto que ignora SIGTERM antes de devolver timeout", async () => {
    if (process.platform === "win32") return;
    // Publish the PID only after the descendant has installed its signal handler.
    // A short startup race tests an unstarted process rather than tree cleanup.
    const script = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});process.send("ready");setInterval(()=>{},1000)'],{stdio:['ignore','ignore','ignore','ipc']}); child.once('message',()=>process.stdout.write(String(child.pid))); process.on('SIGTERM',()=>process.exit(0)); setInterval(()=>{},1000);`;
    let grandchildPid = 0;
    try {
      await runCommand(process.execPath, ["-e", script], { timeout: 3_000, maxBuffer: 1024 });
      throw new Error("Timeout esperado");
    } catch (error) {
      expect(error).toMatchObject({ code: "OMR_CONVERSION_TIMEOUT" });
      grandchildPid = Number((error as { stdout?: string }).stdout);
    }
    expect(grandchildPid).toBeGreaterThan(0);
    let status = "";
    try { status = execFileSync("ps", ["-o", "stat=", "-p", String(grandchildPid)], { encoding: "utf8" }).trim(); } catch { /* process is gone */ }
    expect(status === "" || status.startsWith("Z")).toBe(true);
  }, 15_000);

  it("limita a saída de um processo antes de interrompê-lo", async () => {
    const script = `setInterval(()=>process.stdout.write('x'.repeat(4096)),1);`;
    await expect(runCommand(process.execPath, ["-e", script], { timeout: 5_000, maxBuffer: 8_192 })).rejects.toMatchObject({ code: "OMR_OUTPUT_LIMIT" });
  }, 10_000);
});
