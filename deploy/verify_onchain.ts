/**
 * ApiSeal On-Chain Verification Script.
 *
 * Fetches the deployed contract code from the chain and proves byte-for-byte
 * equality with local contracts/apiseal.py.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import type { Address } from "viem";

async function verifyOnChain(): Promise<void> {
  console.log("=== ApiSeal On-Chain Contract Verification ===");

  // 1. Read local contract source
  const localContractPath = path.resolve(process.cwd(), "contracts/apiseal.py");
  if (!fs.existsSync(localContractPath)) {
    throw new Error(`Local contract not found at ${localContractPath}`);
  }
  const localSource = fs.readFileSync(localContractPath, "utf-8");
  const localSha256 = crypto.createHash("sha256").update(localSource).digest("hex");
  console.log(`[1] Local contract source path: ${localContractPath}`);
  console.log(`    Local source SHA-256:       ${localSha256}`);
  console.log(`    Local character count:      ${localSource.length}`);

  // 2. Resolve target contract address
  let targetAddress = process.env.CONTRACT_ADDRESS;
  if (!targetAddress) {
    const receiptPath = path.resolve(process.cwd(), "deploy/deployment_receipt.json");
    if (fs.existsSync(receiptPath)) {
      const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf-8"));
      targetAddress = receipt.contractAddress;
      console.log(`[2] Read contract address from ${receiptPath}: ${targetAddress}`);
    }
  }

  if (!targetAddress) {
    console.error("ERROR: No contract address provided.");
    console.error("Set CONTRACT_ADDRESS env variable or ensure deploy/deployment_receipt.json exists.");
    process.exit(1);
  }

  console.log(`[3] Target contract address: ${targetAddress}`);
  console.log(`    Target network:          ${studioDevnet.name} (Chain ID: ${studioDevnet.id})`);
  console.log(`    RPC Endpoint:            ${studioDevnet.rpcUrls.default.http[0]}`);

  // 3. Connect to GenLayer Studio Devnet
  const client = createClient({
    endpoint: "https://studio-dev.genlayer.com/api",
    chain: studioDevnet,
  });

  // 4. Fetch deployed contract code from blockchain
  console.log(`[4] Fetching on-chain contract code via gen_getContractCode...`);
  let onChainSource: string;
  try {
    onChainSource = await client.getContractCode(targetAddress as Address);
  } catch (err: any) {
    console.error(`Failed to fetch on-chain code for address ${targetAddress}:`, err.message || err);
    throw err;
  }

  if (!onChainSource || onChainSource.length === 0) {
    throw new Error(`No contract code returned for address ${targetAddress}`);
  }

  const onChainSha256 = crypto.createHash("sha256").update(onChainSource).digest("hex");
  console.log(`[5] On-chain source SHA-256:      ${onChainSha256}`);
  console.log(`    On-chain character count:     ${onChainSource.length}`);

  // 5. Byte-for-byte equality proof
  const localBuffer = Buffer.from(localSource, "utf-8");
  const onChainBuffer = Buffer.from(onChainSource, "utf-8");
  const isByteEqual = localBuffer.equals(onChainBuffer);

  console.log("----------------------------------------------------------------");
  if (isByteEqual && localSha256 === onChainSha256) {
    console.log(">>> VERIFICATION RESULT: PASS <<<");
    console.log("Byte-for-byte exact match verified between local file and on-chain contract code.");
    console.log(`Matching SHA-256: ${localSha256}`);
  } else {
    console.error(">>> VERIFICATION RESULT: FAILED <<<");
    console.error(`Local SHA-256:    ${localSha256}`);
    console.error(`On-Chain SHA-256: ${onChainSha256}`);
    throw new Error("On-chain code does not match local contracts/apiseal.py");
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  verifyOnChain().catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  });
}

export { verifyOnChain };
