/**
 * Live Integration Test Launcher for ApiSeal.
 *
 * Resolves the deployer account from the local OS keychain (coverlock-submitter),
 * supplies credentials ONLY in memory to the child pytest process environment,
 * sets live integration opt-in and authoritative fixture URLs,
 * scrubs in-memory references upon completion,
 * and propagates the child pytest exit code.
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import { resolveSigner } from "./signer.js";

const COMPATIBLE_FIXTURE_URL =
  "https://raw.githubusercontent.com/edwarderlick/ApiSeal/c5f6a834bb6ff51f63862b660389e4e795290a05/fixtures/v1.0.1-compatible.json";
const ADDITIVE_FIXTURE_URL =
  "https://raw.githubusercontent.com/edwarderlick/ApiSeal/c5f6a834bb6ff51f63862b660389e4e795290a05/fixtures/v1.0.1-additive.json";

async function main(): Promise<void> {
  console.log("=== ApiSeal Live Integration Test Launcher ===");
  console.log("[1] Resolving signer from local OS keychain...");

  let signer = await resolveSigner({
    accountName: "coverlock-submitter",
    checkBalance: true,
  });

  console.log(`[2] Live signer verified: ${signer.address}`);
  console.log(
    "[3] Launching pytest integration suite with in-memory child credentials..."
  );

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    APISEAL_RUN_LIVE_TESTS: "1",
    GENLAYER_PRIVATE_KEY: signer.privateKey,
    APISEAL_LIVE_COMPATIBLE_FIXTURE_URL: COMPATIBLE_FIXTURE_URL,
    APISEAL_LIVE_ADDITIVE_FIXTURE_URL: ADDITIVE_FIXTURE_URL,
    PYTHONUTF8: "1",
  };

  const testFile = path.resolve(
    process.cwd(),
    "tests/integration/test_apiseal_live.py"
  );
  const child = spawn("pytest", [testFile, "-v", "-s"], {
    stdio: "inherit",
    env: childEnv,
    shell: process.platform === "win32",
  });

  child.on("close", (code) => {
    // Scrub in-memory references
    signer.privateKey = "";
    delete childEnv.GENLAYER_PRIVATE_KEY;
    console.log(`\n[launcher] Pytest child process exited with code ${code ?? 0}`);
    process.exit(code ?? 0);
  });

  child.on("error", (err) => {
    signer.privateKey = "";
    delete childEnv.GENLAYER_PRIVATE_KEY;
    console.error(`[launcher] Failed to start pytest process: ${err.message}`);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(`[launcher] Fatal error: ${err.message}`);
  process.exit(1);
});
