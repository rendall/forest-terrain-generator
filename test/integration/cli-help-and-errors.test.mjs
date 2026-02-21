import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CLI_ENTRY = resolve(process.cwd(), "src/cli/main.ts");

function runCli(args = []) {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, ["--import", "tsx", CLI_ENTRY, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: "0" }
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.once("error", rejectResult);
    child.once("close", (code) => {
      resolveResult({
        code: code ?? 0,
        stdout,
        stderr
      });
    });
  });
}

describe("CLI help and command-error behavior", () => {
  it("treats help variants and no command as equivalent help with exit 0", async () => {
    const [noCommand, helpCommand, longHelp, shortHelp] = await Promise.all([
      runCli([]),
      runCli(["help"]),
      runCli(["--help"]),
      runCli(["-h"])
    ]);

    expect(noCommand.code).toBe(0);
    expect(helpCommand.code).toBe(0);
    expect(longHelp.code).toBe(0);
    expect(shortHelp.code).toBe(0);

    expect(helpCommand.stdout).toBe(noCommand.stdout);
    expect(longHelp.stdout).toBe(noCommand.stdout);
    expect(shortHelp.stdout).toBe(noCommand.stdout);
    expect(noCommand.stderr).toBe("");
    expect(helpCommand.stderr).toBe("");
    expect(longHelp.stderr).toBe("");
    expect(shortHelp.stderr).toBe("");
  });

  it("returns exit 2 for unknown command", async () => {
    const result = await runCli(["unknown-command"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown command 'unknown-command'");
  });

  it("returns exit 2 for invalid command inputs", async () => {
    const result = await runCli(["generate", "--seed", "1", "--width", "2", "--height", "3"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(
      "Missing required output argument for generate mode: --output-file."
    );
  });
});
