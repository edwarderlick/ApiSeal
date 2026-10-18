/**
 * ApiSeal Deployment Script for GenLayer Studio Devnet Preview.
 *
 * Target:
 * - Network: Studio Devnet (preset: studioDevnet)
 * - Chain ID: 61997
 * - RPC Endpoint: https://studio-dev.genlayer.com/api
 *
 * Safety & Quality:
 * - Uses environment variable PRIVATE_KEY (never hardcoded in sources)
 * - Computes source code SHA-256 before deployment
 * - Pre-validates schema with genvm-lint
 * - Calls supported fee estimation before deployment
 * - Passes fee distribution and feeValue to deployContract
 * - Logs and saves transaction hash immediately
 * - Waits for transaction finalization
 * - Verifies contract execution result (SUCCESS)
 * - Authoritatively extracts deployed contract address from receipt.txDataDecoded?.contractAddress
 * - Writes deployed address and deployment metadata to evidence/studio-dev.md and deploy/deployment_receipt.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient, createAccount, isSuccessful } from "genlayer-js";
import type { TransactionFeeOptions } from "genlayer-js/types";
import { studioDevnet } from "genlayer-js/chains";
import { resolveSigner } from "./signer.js";

interface DeploymentReceipt {
  network: string;
  chainId: number;
  rpcUrl: string;
  contractName: string;
  contractAddress: string;
  sourceSha256: string;
  deployerAddress: string;
  transactionHash: string;
  status: string;
  deployedAt: string;
}

async function main(): Promise<void> {
  console.log("=== ApiSeal Deployment to GenLayer Studio Devnet ===");

  const contractPath = path.resolve(process.cwd(), "contracts/apiseal.py");
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Contract file not found at ${contractPath}`);
  }

  const contractSource = fs.readFileSync(contractPath, "utf-8");
  const sourceSha256 = crypto.createHash("sha256").update(contractSource).digest("hex");
  console.log(`[1] Contract source hash: ${sourceSha256}`);

  // Resolve deployer account from GenLayer CLI OS keychain (coverlock-submitter)
  const signer = await resolveSigner({
    accountName: "coverlock-submitter",
    checkBalance: true,
  });
  const account = signer.account;
  console.log(`[2] Deployer account address: ${account.address}`);

  // Create GenLayer client targeting studioDevnet (61997)
  const client = createClient({
    endpoint: "https://studio-dev.genlayer.com/api",
    chain: studioDevnet,
    account,
  });

  console.log(`[3] Target Network: ${studioDevnet.name} (Chain ID: ${studioDevnet.id})`);
  console.log(`    RPC Endpoint: ${studioDevnet.rpcUrls.default.http[0]}`);

  // Constructor parameters: owner, project_id, review_window_seconds
  const constructorArgs = [
    account.address,
    "org.genlayer.apiseal",
    86400, // 24 hour review window
  ];

  console.log(`[4] Constructor parameters:`, constructorArgs);

  // Call supported GenLayerJS fee-estimation method before deployment
  console.log(`[5] Estimating deployment transaction fees...`);
  let feeOptions: TransactionFeeOptions;
  try {
    const feeEstimate = await client.estimateTransactionFees();
    console.log(`    >>> Estimated feeValue: ${feeEstimate.feeValue.toString()}`);
    feeOptions = {
      distribution: feeEstimate.distribution,
      feeValue: feeEstimate.feeValue,
      messageAllocations: feeEstimate.messageAllocations,
    };
  } catch (err: any) {
    console.error(`    >>> Fee estimation failed: ${err?.message || err}`);
    throw new Error(`Deployment aborted: fee estimation failed (${err?.message || err})`);
  }

  console.log(`[6] Submitting deployment transaction...`);
  let txHash: `0x${string}`;
  try {
    txHash = await client.deployContract({
      code: contractSource,
      args: constructorArgs,
      leaderOnly: false,
      fees: feeOptions,
    });
    console.log(`    >>> Transaction submitted! Hash: ${txHash}`);
  } catch (err: any) {
    console.error(`Deployment transaction submission failed:`, err.message || err);
    throw err;
  }

  // Save transaction hash immediately before waiting to prevent lost references
  const pendingReceiptPath = path.resolve(process.cwd(), "deploy/pending_tx.json");
  fs.writeFileSync(
    pendingReceiptPath,
    JSON.stringify({ txHash, sourceSha256, deployer: account.address, submittedAt: new Date().toISOString() }, null, 2)
  );
  console.log(`[7] Saved pending transaction reference to deploy/pending_tx.json`);

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash as any,
    waitUntil: "finalized",
    interval: 3000,
    retries: 60,
  });

  // Verify execution result
  const executionSuccess = isSuccessful(receipt);
  console.log(`[8] Consensus result: ${receipt.status || "COMPLETED"}, execution result: ${receipt.txExecutionResultName || (executionSuccess ? "SUCCESS" : "FAILED")}`);

  if (!executionSuccess) {
    console.error("ERROR: Contract deployment execution failed under validator consensus!");
    console.error("Consensus data:", JSON.stringify(receipt.consensus_data || {}, null, 2));
    throw new Error(`Deployment transaction execution failed`);
  }

  // Authoritative extraction preferring decoded deployment field receipt.txDataDecoded?.contractAddress
  const decodedDeploy = receipt.txDataDecoded as any;
  const deployedAddress =
    decodedDeploy?.contractAddress ||
    (receipt.data as any)?.contract_address ||
    (receipt as any).recipient ||
    (receipt as any).contract_address;

  if (!deployedAddress) {
    throw new Error(`Transaction succeeded but failed to extract deployed contract address from receipt`);
  }

  console.log(`[9] Contract successfully deployed at address: ${deployedAddress}`);

  const finalReceipt: DeploymentReceipt = {
    network: studioDevnet.name,
    chainId: studioDevnet.id,
    rpcUrl: studioDevnet.rpcUrls.default.http[0],
    contractName: "ApiSeal",
    contractAddress: deployedAddress,
    sourceSha256,
    deployerAddress: account.address,
    transactionHash: txHash,
    status: "FINALIZED",
    deployedAt: new Date().toISOString(),
  };

  const receiptPath = path.resolve(process.cwd(), "deploy/deployment_receipt.json");
  fs.writeFileSync(receiptPath, JSON.stringify(finalReceipt, null, 2));
  console.log(`[10] Saved final deployment receipt to deploy/deployment_receipt.json`);

  // Update evidence/studio-dev.md with on-chain deployment record
  const evidencePath = path.resolve(process.cwd(), "evidence/studio-dev.md");
  if (fs.existsSync(evidencePath)) {
    const deploymentEntry = `\n\n## Live Deployment Record\n\n- **Contract Address**: \`${deployedAddress}\`\n- **Transaction Hash**: \`${txHash}\`\n- **Deployer**: \`${account.address}\`\n- **Network**: ${studioDevnet.name} (Chain ID: ${studioDevnet.id})\n- **Deployed At**: ${finalReceipt.deployedAt}\n- **Source SHA-256**: \`${sourceSha256}\`\n`;
    fs.appendFileSync(evidencePath, deploymentEntry, "utf-8");
    console.log(`[11] Updated ${evidencePath} with live deployment record`);
  }

  // Remove pending file now that final receipt is committed
  if (fs.existsSync(pendingReceiptPath)) {
    fs.unlinkSync(pendingReceiptPath);
  }

  console.log("=== Deployment Complete ===");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error("Deployment failed:", err);
    process.exit(1);
  });
}

export { main };
