import { spawn } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const updateGoldens = args.includes("--update-goldens");
const passthrough = args.filter((arg) => arg !== "--update-goldens");

const vitestEntry = resolve(process.cwd(), "node_modules/vitest/vitest.mjs");
const goldenTestPath = resolve(process.cwd(), "test/golden/phase6-e2e-golden.test.mjs");

const child = spawn(process.execPath, [vitestEntry, "run", goldenTestPath, ...passthrough], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    FTG_UPDATE_GOLDENS: updateGoldens ? "1" : process.env.FTG_UPDATE_GOLDENS ?? "0"
  },
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("close", (code) => {
  process.exit(code ?? 1);
});
