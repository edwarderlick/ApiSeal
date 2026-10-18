/**
 * Live Integration Test Suite for ApiSeal on GenLayer Studio Devnet.
 *
 * Implements the live integration harness in TypeScript using supported public
 * genlayer-js APIs (with zero private monkey patches) while keeping pytest as
 * the safe offline suite.
 *
 * Exercises all four required live scenarios against disposable deployments:
 * 1. Compatible release accepted
 * 2. Insufficient version bump rejected
 * 3. Hash mismatch or fetch failure rejected
 * 4. Repeated review prevented/reverted
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { resolveSigner } from "./signer.js";

const COMPATIBLE_FIXTURE_URL =
  "https://raw.githubusercontent.com/edwarderlick/ApiSeal/c5f6a834bb6ff51f63862b660389e4e795290a05/fixtures/v1.0.1-compatible.json";
const ADDITIVE_FIXTURE_URL =
  "https://raw.githubusercontent.com/edwarderlick/ApiSeal/c5f6a834bb6ff51f63862b660389e4e795290a05/fixtures/v1.0.1-additive.json";

function loadAuthoritativeFixture(fixtureName: string): { raw: string; sha256: string } {
  const p = path.resolve(process.cwd(), "fixtures", fixtureName);
  if (!fs.existsSync(p)) {
    throw new Error(`Authoritative fixture not found: ${p}`);
  }
  const raw = fs.readFileSync(p, "utf-8");
  const parsed = JSON.parse(raw);
  const canonical = JSON.stringify(parsed);
  // Verify compact sorted JSON
  const sha256 = crypto.createHash("sha256").update(raw, "utf-8").digest("hex");
  return { raw, sha256 };
}

function makeBaselineManifest(): string {
  const surfaces = [
    {
      behavior_contract: "Synchronously debits customer payment source",
      id: "create_charge",
      method: "POST",
      path: "/charges",
      request_contract: "Amount in cents and currency",
      response_contract: "Charge id and status",
    },
    {
      behavior_contract: "Idempotent retrieval of charge details",
      id: "get_charge",
      method: "GET",
      path: "/charges/{id}",
      request_contract: "Charge id in path",
      response_contract: "Charge record or 404",
    },
  ];
  surfaces.sort((a, b) => a.id.localeCompare(b.id));
  const obj = { api_name: "Payment Gateway API", surfaces };
  return JSON.stringify(obj);
}

export interface ScenarioResult {
  scenarioNumber: number;
  scenarioName: string;
  contractAddress: string;
  deploymentTxHash: string;
  transactions: {
    action: string;
    txHash: string;
    status: number | string;
    executionResult: string;
    consensusOk: boolean;
  }[];
  finalState: any;
  passed: boolean;
}

async function deployDisposableContract(
  client: any,
  contractSource: string,
  ownerAddress: string
): Promise<{ address: string; deployTxHash: string }> {
  const fees = await client.estimateTransactionFees();
  const txHash = await client.deployContract({
    code: contractSource,
    args: [ownerAddress, "api.payments.core", 86400],
    leaderOnly: false,
    fees: {
      distribution: fees.distribution,
      feeValue: fees.feeValue,
    },
  });

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    waitUntil: "finalized",
    interval: 3000,
    retries: 60,
  });

  const ok = isSuccessful(receipt);
  if (!ok) {
    throw new Error(
      `Disposable deployment failed: status=${receipt.status}, exec=${receipt.txExecutionResultName}`
    );
  }

  const address =
    receipt.txDataDecoded?.contractAddress ||
    receipt.data?.contract_address ||
    receipt.recipient;

  if (!address) {
    throw new Error("Failed to extract deployed address from receipt");
  }

  return { address, deployTxHash: txHash };
}

async function sendWrite(
  client: any,
  contractAddress: string,
  functionName: string,
  args: any[]
): Promise<{ txHash: string; receipt: any; ok: boolean }> {
  const fees = await client.estimateTransactionFees();
  const txHash = await client.writeContract({
    address: contractAddress as `0x${string}`,
    functionName,
    args,
    leaderOnly: false,
    fees: {
      distribution: fees.distribution,
      feeValue: fees.feeValue,
    },
  });

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    waitUntil: "finalized",
    interval: 3000,
    retries: 60,
  });

  const ok = isSuccessful(receipt);
  return { txHash, receipt, ok };
}

async function runScenario1(client: any, contractSource: string, ownerAddress: string): Promise<ScenarioResult> {
  console.log("\n-----------------------------------------------------------");
  console.log("--- SCENARIO 1: Compatible Release Accepted Workflow ---");
  console.log("-----------------------------------------------------------");

  const baseJson = makeBaselineManifest();
  const { sha256: candSha } = loadAuthoritativeFixture("v1.0.1-compatible.json");

  // 1. Deploy
  console.log("[s1] Deploying disposable ApiSeal candidate...");
  const { address, deployTxHash } = await deployDisposableContract(client, contractSource, ownerAddress);
  console.log(`[s1] Deployed at: ${address} (tx: ${deployTxHash})`);

  const txRecords: ScenarioResult["transactions"] = [];

  // 2. Register baseline v1.0.0
  console.log("[s1] Registering baseline v1.0.0...");
  const reg = await sendWrite(client, address, "register_baseline", [baseJson, 1, 0, 0]);
  console.log(`[s1] register_baseline tx: ${reg.txHash}, ok=${reg.ok}, exec=${reg.receipt.txExecutionResultName}`);
  txRecords.push({
    action: "register_baseline",
    txHash: reg.txHash,
    status: reg.receipt.status,
    executionResult: reg.receipt.txExecutionResultName,
    consensusOk: reg.ok,
  });
  if (!reg.ok) throw new Error("Scenario 1 register_baseline failed");

  // 3. Propose v1.0.1
  console.log("[s1] Proposing patch v1.0.1 with compatible fixture URL...");
  const prop = await sendWrite(client, address, "propose_release", [COMPATIBLE_FIXTURE_URL, candSha, 1, 0, 1]);
  console.log(`[s1] propose_release tx: ${prop.txHash}, ok=${prop.ok}, exec=${prop.receipt.txExecutionResultName}`);
  txRecords.push({
    action: "propose_release",
    txHash: prop.txHash,
    status: prop.receipt.status,
    executionResult: prop.receipt.txExecutionResultName,
    consensusOk: prop.ok,
  });
  if (!prop.ok) throw new Error("Scenario 1 propose_release failed");

  // 4. Review release via multi-validator consensus
  console.log("[s1] Executing review_release via validator consensus...");
  const rev = await sendWrite(client, address, "review_release", []);
  console.log(`[s1] review_release tx: ${rev.txHash}, ok=${rev.ok}, exec=${rev.receipt.txExecutionResultName}`);
  txRecords.push({
    action: "review_release",
    txHash: rev.txHash,
    status: rev.receipt.status,
    executionResult: rev.receipt.txExecutionResultName,
    consensusOk: rev.ok,
  });
  if (!rev.ok) throw new Error("Scenario 1 review_release execution failed");

  // 5. Readback verification
  const curr = await client.readContract({
    address: address as `0x${string}`,
    functionName: "get_current_release",
    args: [],
  });
  console.log("[s1] Current release after review:", JSON.stringify(curr));

  const ver = curr.current_version;
  const isV101 = ver && Number(ver.major) === 1 && Number(ver.minor) === 0 && Number(ver.patch) === 1;
  const isAccepted = Number(curr.accepted_release_count) === 1;
  const hashMatch = curr.canonical_manifest_sha256 === candSha;

  if (!isV101 || !isAccepted || !hashMatch) {
    throw new Error(`Scenario 1 readback assertion failed: v101=${isV101}, accepted=${isAccepted}, hashMatch=${hashMatch}`);
  }

  console.log("[s1] >>> SCENARIO 1 PASSED <<<");
  return {
    scenarioNumber: 1,
    scenarioName: "Compatible release accepted",
    contractAddress: address,
    deploymentTxHash: deployTxHash,
    transactions: txRecords,
    finalState: curr,
    passed: true,
  };
}

async function runScenario2(client: any, contractSource: string, ownerAddress: string): Promise<ScenarioResult> {
  console.log("\n-----------------------------------------------------------");
  console.log("--- SCENARIO 2: Insufficient Version Bump Rejected ---");
  console.log("-----------------------------------------------------------");

  const baseJson = makeBaselineManifest();
  const { sha256: candSha } = loadAuthoritativeFixture("v1.0.1-additive.json");

  // 1. Deploy
  console.log("[s2] Deploying disposable ApiSeal candidate...");
  const { address, deployTxHash } = await deployDisposableContract(client, contractSource, ownerAddress);
  console.log(`[s2] Deployed at: ${address} (tx: ${deployTxHash})`);

  const txRecords: ScenarioResult["transactions"] = [];

  // 2. Register baseline v1.0.0
  console.log("[s2] Registering baseline v1.0.0...");
  const reg = await sendWrite(client, address, "register_baseline", [baseJson, 1, 0, 0]);
  console.log(`[s2] register_baseline tx: ${reg.txHash}, ok=${reg.ok}, exec=${reg.receipt.txExecutionResultName}`);
  txRecords.push({
    action: "register_baseline",
    txHash: reg.txHash,
    status: reg.receipt.status,
    executionResult: reg.receipt.txExecutionResultName,
    consensusOk: reg.ok,
  });
  if (!reg.ok) throw new Error("Scenario 2 register_baseline failed");

  // 3. Propose v1.0.1 (patch bump) for additive fixture (requires at least minor bump v1.1.0)
  console.log("[s2] Proposing insufficient patch bump v1.0.1 for additive fixture...");
  const prop = await sendWrite(client, address, "propose_release", [ADDITIVE_FIXTURE_URL, candSha, 1, 0, 1]);
  console.log(`[s2] propose_release tx: ${prop.txHash}, ok=${prop.ok}, exec=${prop.receipt.txExecutionResultName}`);
  txRecords.push({
    action: "propose_release",
    txHash: prop.txHash,
    status: prop.receipt.status,
    executionResult: prop.receipt.txExecutionResultName,
    consensusOk: prop.ok,
  });
  if (!prop.ok) throw new Error("Scenario 2 propose_release failed");

  // 4. Review release via multi-validator consensus
  console.log("[s2] Executing review_release (deterministic rejection expected)...");
  const rev = await sendWrite(client, address, "review_release", []);
  console.log(`[s2] review_release tx: ${rev.txHash}, ok=${rev.ok}, exec=${rev.receipt.txExecutionResultName}`);
  txRecords.push({
    action: "review_release",
    txHash: rev.txHash,
    status: rev.receipt.status,
    executionResult: rev.receipt.txExecutionResultName,
    consensusOk: rev.ok,
  });
  if (!rev.ok) throw new Error("Scenario 2 review_release transaction execution failed");

  // 5. Readback verification: rejected, baseline unchanged at v1.0.0
  const curr = await client.readContract({
    address: address as `0x${string}`,
    functionName: "get_current_release",
    args: [],
  });
  console.log("[s2] Current release after review:", JSON.stringify(curr));

  const history = await client.readContract({
    address: address as `0x${string}`,
    functionName: "get_history",
    args: [0],
  });
  console.log("[s2] History entry 0:", JSON.stringify(history));

  const ver = curr.current_version;
  const isV100 = ver && Number(ver.major) === 1 && Number(ver.minor) === 0 && Number(ver.patch) === 0;
  const isRejected = Number(curr.rejected_release_count) === 1;
  const histRejected = history.terminal_result === "REJECTED";

  if (!isV100 || !isRejected || !histRejected) {
    throw new Error(
      `Scenario 2 readback assertion failed: isV100=${isV100}, isRejected=${isRejected}, histRejected=${histRejected}`
    );
  }

  console.log("[s2] >>> SCENARIO 2 PASSED <<<");
  return {
    scenarioNumber: 2,
    scenarioName: "Insufficient version bump rejected",
    contractAddress: address,
    deploymentTxHash: deployTxHash,
    transactions: txRecords,
    finalState: { curr, history },
    passed: true,
  };
}

async function runScenario3(client: any, contractSource: string, ownerAddress: string): Promise<ScenarioResult> {
  console.log("\n-----------------------------------------------------------");
  console.log("--- SCENARIO 3: Hash Mismatch / Fetch Failure Reverted ---");
  console.log("-----------------------------------------------------------");

  const baseJson = makeBaselineManifest();
  const corruptedSha = "f".repeat(64);
  const invalidUrl = "https://studio-dev.genlayer.com/nonexistent_manifest_404.json";

  // 1. Deploy
  console.log("[s3] Deploying disposable ApiSeal candidate...");
  const { address, deployTxHash } = await deployDisposableContract(client, contractSource, ownerAddress);
  console.log(`[s3] Deployed at: ${address} (tx: ${deployTxHash})`);

  const txRecords: ScenarioResult["transactions"] = [];

  // 2. Register baseline v1.0.0
  console.log("[s3] Registering baseline v1.0.0...");
  const reg = await sendWrite(client, address, "register_baseline", [baseJson, 1, 0, 0]);
  console.log(`[s3] register_baseline tx: ${reg.txHash}, ok=${reg.ok}, exec=${reg.receipt.txExecutionResultName}`);
  txRecords.push({
    action: "register_baseline",
    txHash: reg.txHash,
    status: reg.receipt.status,
    executionResult: reg.receipt.txExecutionResultName,
    consensusOk: reg.ok,
  });
  if (!reg.ok) throw new Error("Scenario 3 register_baseline failed");

  // 3. Propose with invalid hash and nonexistent URL
  console.log("[s3] Proposing release with corrupted SHA-256 and invalid URL...");
  const prop = await sendWrite(client, address, "propose_release", [invalidUrl, corruptedSha, 1, 0, 1]);
  console.log(`[s3] propose_release tx: ${prop.txHash}, ok=${prop.ok}, exec=${prop.receipt.txExecutionResultName}`);
  txRecords.push({
    action: "propose_release",
    txHash: prop.txHash,
    status: prop.receipt.status,
    executionResult: prop.receipt.txExecutionResultName,
    consensusOk: prop.ok,
  });
  if (!prop.ok) throw new Error("Scenario 3 propose_release failed");

  // 4. Review release: MUST FAIL / REVERT GenVM execution
  console.log("[s3] Executing review_release (GenVM execution failure expected)...");
  const rev = await sendWrite(client, address, "review_release", []);
  console.log(
    `[s3] review_release tx: ${rev.txHash}, ok=${rev.ok}, exec=${rev.receipt.txExecutionResultName}`
  );
  txRecords.push({
    action: "review_release",
    txHash: rev.txHash,
    status: rev.receipt.status,
    executionResult: rev.receipt.txExecutionResultName,
    consensusOk: rev.ok,
  });

  // Verify that GenVM execution reverted
  if (rev.ok || rev.receipt.txExecutionResultName === "FINISHED_WITH_RETURN") {
    throw new Error(
      `Scenario 3 failed: review_release succeeded when it was expected to revert on invalid hash/fetch error!`
    );
  }
  console.log("[s3] Confirmed: review_release reverted/failed GenVM execution as required!");

  // 5. Readback verification: status remains PENDING
  const config = await client.readContract({
    address: address as `0x${string}`,
    functionName: "get_config",
    args: [],
  });
  console.log("[s3] Contract config after failed review:", JSON.stringify(config));

  if (config.status !== "PENDING") {
    throw new Error(`Scenario 3 state assertion failed: expected PENDING, got ${config.status}`);
  }

  console.log("[s3] >>> SCENARIO 3 PASSED <<<");
  return {
    scenarioNumber: 3,
    scenarioName: "Hash mismatch or fetch failure rejected",
    contractAddress: address,
    deploymentTxHash: deployTxHash,
    transactions: txRecords,
    finalState: config,
    passed: true,
  };
}

async function runScenario4(client: any, contractSource: string, ownerAddress: string): Promise<ScenarioResult> {
  console.log("\n-----------------------------------------------------------");
  console.log("--- SCENARIO 4: Repeated Review Revert Workflow ---");
  console.log("-----------------------------------------------------------");

  const baseJson = makeBaselineManifest();
  const { sha256: candSha } = loadAuthoritativeFixture("v1.0.1-compatible.json");

  // 1. Deploy
  console.log("[s4] Deploying disposable ApiSeal candidate...");
  const { address, deployTxHash } = await deployDisposableContract(client, contractSource, ownerAddress);
  console.log(`[s4] Deployed at: ${address} (tx: ${deployTxHash})`);

  const txRecords: ScenarioResult["transactions"] = [];

  // 2. Register baseline v1.0.0
  console.log("[s4] Registering baseline v1.0.0...");
  const reg = await sendWrite(client, address, "register_baseline", [baseJson, 1, 0, 0]);
  console.log(`[s4] register_baseline tx: ${reg.txHash}, ok=${reg.ok}, exec=${reg.receipt.txExecutionResultName}`);
  txRecords.push({
    action: "register_baseline",
    txHash: reg.txHash,
    status: reg.receipt.status,
    executionResult: reg.receipt.txExecutionResultName,
    consensusOk: reg.ok,
  });
  if (!reg.ok) throw new Error("Scenario 4 register_baseline failed");

  // 3. Propose v1.0.1
  console.log("[s4] Proposing patch v1.0.1...");
  const prop = await sendWrite(client, address, "propose_release", [COMPATIBLE_FIXTURE_URL, candSha, 1, 0, 1]);
  console.log(`[s4] propose_release tx: ${prop.txHash}, ok=${prop.ok}, exec=${prop.receipt.txExecutionResultName}`);
  txRecords.push({
    action: "propose_release",
    txHash: prop.txHash,
    status: prop.receipt.status,
    executionResult: prop.receipt.txExecutionResultName,
    consensusOk: prop.ok,
  });
  if (!prop.ok) throw new Error("Scenario 4 propose_release failed");

  // 4. First review_release: succeeds and transitions state to READY
  console.log("[s4] Executing first review_release (expected to succeed)...");
  const rev1 = await sendWrite(client, address, "review_release", []);
  console.log(`[s4] First review_release tx: ${rev1.txHash}, ok=${rev1.ok}, exec=${rev1.receipt.txExecutionResultName}`);
  txRecords.push({
    action: "review_release_1",
    txHash: rev1.txHash,
    status: rev1.receipt.status,
    executionResult: rev1.receipt.txExecutionResultName,
    consensusOk: rev1.ok,
  });
  if (!rev1.ok) throw new Error("Scenario 4 first review_release failed");

  // Verify state is READY
  const cfg1 = await client.readContract({
    address: address as `0x${string}`,
    functionName: "get_config",
    args: [],
  });
  if (cfg1.status !== "READY") {
    throw new Error(`Scenario 4 expected READY status after first review, got ${cfg1.status}`);
  }
  console.log("[s4] First review promoted release; contract status is now READY");

  // 5. Second review_release: MUST FAIL / REVERT because no proposal is PENDING
  console.log("[s4] Executing second review_release (revert expected)...");
  const rev2 = await sendWrite(client, address, "review_release", []);
  console.log(
    `[s4] Second review_release tx: ${rev2.txHash}, ok=${rev2.ok}, exec=${rev2.receipt.txExecutionResultName}`
  );
  txRecords.push({
    action: "review_release_2_repeat",
    txHash: rev2.txHash,
    status: rev2.receipt.status,
    executionResult: rev2.receipt.txExecutionResultName,
    consensusOk: rev2.ok,
  });

  if (rev2.ok || rev2.receipt.txExecutionResultName === "FINISHED_WITH_RETURN") {
    throw new Error("Scenario 4 repeat review succeeded when it must revert!");
  }
  console.log("[s4] Confirmed: repeat review_release reverted as required!");

  console.log("[s4] >>> SCENARIO 4 PASSED <<<");
  return {
    scenarioNumber: 4,
    scenarioName: "Repeated review prevented/reverted",
    contractAddress: address,
    deploymentTxHash: deployTxHash,
    transactions: txRecords,
    finalState: cfg1,
    passed: true,
  };
}

async function main(): Promise<void> {
  console.log("===============================================================");
  console.log("=== ApiSeal Phase 6: Live Integration Scenarios Runner     ===");
  console.log("===============================================================");

  const contractPath = path.resolve(process.cwd(), "contracts/apiseal.py");
  const contractSource = fs.readFileSync(contractPath, "utf-8");
  const sourceHash = crypto.createHash("sha256").update(contractSource, "utf-8").digest("hex");
  console.log(`[suite] Target contract source hash: ${sourceHash}`);

  // Resolve signer
  const signer = await resolveSigner({
    accountName: "coverlock-submitter",
    checkBalance: true,
  });
  console.log(`[suite] Signer address: ${signer.address}`);

  const client = createClient({
    endpoint: "https://studio-dev.genlayer.com/api",
    chain: studioDevnet,
    account: signer.account,
  });

  const allResults: ScenarioResult[] = [];

  try {
    const r1 = await runScenario1(client, contractSource, signer.address);
    allResults.push(r1);

    const r2 = await runScenario2(client, contractSource, signer.address);
    allResults.push(r2);

    const r3 = await runScenario3(client, contractSource, signer.address);
    allResults.push(r3);

    const r4 = await runScenario4(client, contractSource, signer.address);
    allResults.push(r4);

    console.log("\n===============================================================");
    console.log("=== ALL FOUR LIVE INTEGRATION SCENARIOS PASSED WITH SUCCESS ===");
    console.log("===============================================================");

    // Save evidence
    const evidencePath = path.resolve(process.cwd(), "evidence/live_scenarios_receipt.json");
    fs.writeFileSync(
      evidencePath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          contractSourceHash: sourceHash,
          signerAddress: signer.address,
          network: "GenLayer Studio Devnet (61997)",
          scenarios: allResults,
        },
        null,
        2
      )
    );
    console.log(`[suite] Saved detailed live scenarios evidence to ${evidencePath}`);
  } finally {
    // Best-effort reference cleanup
    signer.privateKey = "";
  }
}

main().catch((err) => {
  console.error(`\n[suite] FATAL ERROR IN LIVE INTEGRATION SUITE:`, err);
  process.exit(1);
});
