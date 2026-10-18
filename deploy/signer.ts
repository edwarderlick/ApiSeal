/**
 * ApiSeal Signer Resolver.
 *
 * Implements autonomous signer discovery matching the proven ScopeGate pattern:
 * - Service: genlayer-cli
 * - Account entry: account:coverlock-submitter
 * - Dynamically resolves keytar from the GenLayer CLI installation.
 * - Supports environment-variable fallback only as an optional secondary mechanism.
 * - Never prints, persists, hashes, serializes, or includes the private key in an error or log.
 * - Derives and displays only the public deployer address.
 * - Verifies the address balance on Studio Devnet.
 * - Fails closed if the keychain account cannot be resolved.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, createAccount } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

export interface SignerOptions {
  accountName?: string;
  checkBalance?: boolean;
  minBalanceWei?: bigint;
  silent?: boolean;
}

export interface ResolvedSigner {
  accountName: string;
  account: ReturnType<typeof createAccount>;
  address: string;
  privateKey: string;
  balance?: bigint;
  balanceGen?: number;
}

/**
 * Dynamically locate and import keytar from local or global GenLayer CLI installation.
 */
export async function resolveKeytar(): Promise<any> {
  const candidatePaths = [
    "keytar",
    process.env.APPDATA
      ? path.join(
          process.env.APPDATA,
          "npm/node_modules/genlayer/node_modules/keytar/lib/keytar.js"
        )
      : null,
    process.env.LOCALAPPDATA
      ? path.join(
          process.env.LOCALAPPDATA,
          "npm/node_modules/genlayer/node_modules/keytar/lib/keytar.js"
        )
      : null,
    process.env.USERPROFILE
      ? path.join(
          process.env.USERPROFILE,
          "AppData/Roaming/npm/node_modules/genlayer/node_modules/keytar/lib/keytar.js"
        )
      : null,
    process.env.HOME
      ? path.join(
          process.env.HOME,
          ".config/genlayer/node_modules/keytar/lib/keytar.js"
        )
      : null,
  ].filter(Boolean) as string[];

  for (const cand of candidatePaths) {
    try {
      if (cand !== "keytar" && !fs.existsSync(cand)) continue;
      const mod = await import(
        cand === "keytar" ? "keytar" : pathToFileURL(cand).href
      );
      const keytar = mod.default ?? mod;
      if (keytar && typeof keytar.getPassword === "function") {
        return keytar;
      }
    } catch {
      // Continue to next candidate
    }
  }
  return null;
}

/**
 * Resolve deployer account from GenLayer CLI OS-keychain or optional environment variable.
 */
export async function resolveSigner(
  options?: SignerOptions
): Promise<ResolvedSigner> {
  const accountName = options?.accountName ?? "coverlock-submitter";
  let rawKey: string | null = null;

  // 1. Try OS keychain first
  const keytar = await resolveKeytar();
  if (keytar) {
    try {
      rawKey = await keytar.getPassword("genlayer-cli", `account:${accountName}`);
    } catch {
      // OS keychain read failure - proceed to fallback
    }
  }

  // 2. Secondary fallback to environment variables
  if (!rawKey || !rawKey.trim()) {
    rawKey =
      process.env.DEPLOYER_PRIVATE_KEY ||
      process.env.GENLAYER_PRIVATE_KEY ||
      process.env.PRIVATE_KEY ||
      null;
  }

  // 3. Fail closed if not resolved
  if (!rawKey || !rawKey.trim()) {
    throw new Error(
      `Deployer account '${accountName}' could not be resolved from OS keychain (genlayer-cli) or environment.`
    );
  }

  // 4. Sanitize format
  let keyClean = rawKey.trim();
  if (!keyClean.startsWith("0x") && !keyClean.startsWith("0X")) {
    keyClean = `0x${keyClean}`;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(keyClean)) {
    throw new Error(
      `Invalid private key format for account '${accountName}': expected 64 hex characters.`
    );
  }

  // 5. Derive public account
  const account = createAccount(keyClean as `0x${string}`);
  if (!options?.silent) {
    console.log(`[signer] Deployer account: ${accountName} (${account.address})`);
  }

  // 6. Balance verification against Studio Devnet
  let balance: bigint | undefined;
  let balanceGen: number | undefined;
  if (options?.checkBalance !== false) {
    const client = createClient({ chain: studioDevnet });
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        balance = await client.getBalance({ address: account.address });
        break;
      } catch (err: any) {
        if (attempt === 3) {
          throw new Error(
            `Failed to retrieve balance for ${account.address} from Studio Devnet: ${err.message}`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    if (balance !== undefined) {
      balanceGen = Number(balance) / 1e18;
      if (!options?.silent) {
        console.log(
          `[signer] Deployer balance: ${balance.toString()} wei (~${balanceGen} GEN)`
        );
      }
      const minWei = options?.minBalanceWei ?? 0n;
      if (balance < minWei) {
        throw new Error(
          `Deployer balance (${balance.toString()} wei) is below required minimum (${minWei.toString()} wei).`
        );
      }
    }
  }

  return {
    accountName,
    account,
    address: account.address,
    privateKey: keyClean,
    balance,
    balanceGen,
  };
}
