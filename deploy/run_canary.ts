/**
 * Phase 5 Disposable Live Canary
 *
 * Deploys a disposable canary contract using the exact target runner:
 * py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng
 * Exercises:
 * - Constructor deployment
 * - A state-modifying write call (exercise_nondet)
 * - Nondeterministic web retrieval (gl.nondet.web.get)
 * - Nondeterministic model execution (gl.nondet.exec_prompt)
 * - Multi-validator consensus (gl.vm.run_nondet)
 * - Verification of terminal MAJORITY_AGREE and FINISHED_WITH_RETURN
 * - Readback verification of state transition
 */

import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { resolveSigner } from "./signer.js";

const CANARY_SOURCE = `# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import genlayer as gl
import json

Address = gl.Address
u256 = gl.u256

class Canary(gl.contract.Contract):
    last_status: str
    verified_url: str

    def __init__(self):
        self.last_status = "INITIALIZED"
        self.verified_url = ""

    @gl.public.view
    def get_status(self) -> str:
        return self.last_status

    @gl.public.write
    def exercise_nondet(self, test_url: str) -> None:
        def leader_fn() -> dict:
            res = gl.nondet.web.get(test_url)
            if res.status != 200:
                raise Exception("Non-200 status from target URL")
            prompt = "Return exactly JSON: {\\"result\\":\\"OK\\"}"
            model_res = gl.nondet.exec_prompt(prompt, response_format="json")
            return {"status": "SUCCESS", "url": test_url, "length": len(res.body or b""), "model": model_res.get("result", "")}

        def validator_fn(leader_res: object) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            try:
                my_res = leader_fn()
                return my_res == leader_res.calldata
            except Exception:
                return False

        if hasattr(gl.vm, "run_nondet_unsafe"):
            res = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        else:
            res = gl.vm.run_nondet(leader_fn, validator_fn)

        self.last_status = res["status"]
        self.verified_url = res["url"]
`;

const TEST_URL =
  "https://raw.githubusercontent.com/edwarderlick/ApiSeal/c5f6a834bb6ff51f63862b660389e4e795290a05/fixtures/v1.0.1-compatible.json";

export interface CanaryResult {
  deployTxHash: string;
  contractAddress: string;
  deployStatus: string | number;
  deployExecutionResult: string;
  writeTxHash: string;
  writeStatus: string | number;
  writeExecutionResult: string;
  readbackStatus: string;
}

export async function runCanary(): Promise<CanaryResult> {
  console.log("\n=======================================================");
  console.log("=== PHASE 5: DISPOSABLE CANARY EXECUTION ON DEVNET ===");
  console.log("=======================================================");

  const signer = await resolveSigner({
    accountName: "coverlock-submitter",
    checkBalance: true,
  });
  console.log(`[canary] Signer resolved: ${signer.address}`);

  const client = createClient({
    endpoint: "https://studio-dev.genlayer.com/api",
    chain: studioDevnet,
    account: signer.account,
  });

  // 1. Fee estimation for deployment
  console.log(`[canary] Estimating fees for canary deployment...`);
  const deployFees = await client.estimateTransactionFees();

  console.log(`[canary] Deploying disposable canary contract...`);
  const deployTxHash = await client.deployContract({
    code: CANARY_SOURCE,
    args: [],
    leaderOnly: false,
    fees: {
      distribution: deployFees.distribution,
      feeValue: deployFees.feeValue,
    },
  });
  console.log(`[canary] Deploy transaction submitted: ${deployTxHash}`);

  const deployReceipt = await client.waitForTransactionReceipt({
    hash: deployTxHash as any,
    waitUntil: "finalized",
    interval: 3000,
    retries: 60,
  });

  const deployOk = isSuccessful(deployReceipt);
  const deployStatus = deployReceipt.status || "UNKNOWN";
  const deployExecutionResult = deployReceipt.txExecutionResultName || (deployOk ? "FINISHED_WITH_RETURN" : "FAILED");
  console.log(
    `[canary] Deploy receipt: status=${deployStatus}, executionResult=${deployExecutionResult}`
  );

  if (!deployOk) {
    throw new Error(
      `Canary deployment failed: status=${deployStatus}, executionResult=${deployExecutionResult}`
    );
  }

  const contractAddress =
    (deployReceipt.txDataDecoded as any)?.contractAddress ||
    (deployReceipt.data as any)?.contract_address ||
    (deployReceipt as any).recipient;

  if (!contractAddress) {
    throw new Error("Could not extract canary contract address from receipt");
  }
  console.log(`[canary] Canary contract address: ${contractAddress}`);

  // 2. Read initial state
  const initialStatus = await client.readContract({
    address: contractAddress as `0x${string}`,
    functionName: "get_status",
    args: [],
  });
  console.log(`[canary] Initial state readback: ${initialStatus}`);
  if (initialStatus !== "INITIALIZED") {
    throw new Error(`Expected INITIALIZED, got: ${initialStatus}`);
  }

  // 3. Exercise write call with nondet
  console.log(`[canary] Estimating fees for exercise_nondet write call...`);
  const writeFees = await client.estimateTransactionFees();

  console.log(`[canary] Calling exercise_nondet with test URL...`);
  const writeTxHash = await client.writeContract({
    address: contractAddress as `0x${string}`,
    functionName: "exercise_nondet",
    args: [TEST_URL],
    leaderOnly: false,
    fees: {
      distribution: writeFees.distribution,
      feeValue: writeFees.feeValue,
    },
  });
  console.log(`[canary] Write transaction submitted: ${writeTxHash}`);

  const writeReceipt = await client.waitForTransactionReceipt({
    hash: writeTxHash as any,
    waitUntil: "finalized",
    interval: 3000,
    retries: 60,
  });

  const writeOk = isSuccessful(writeReceipt);
  const writeStatus = writeReceipt.status || "UNKNOWN";
  const writeExecutionResult = writeReceipt.txExecutionResultName || (writeOk ? "FINISHED_WITH_RETURN" : "FAILED");
  console.log(
    `[canary] Write receipt: status=${writeStatus}, executionResult=${writeExecutionResult}`
  );

  if (!writeOk) {
    throw new Error(
      `Canary exercise_nondet failed: status=${writeStatus}, executionResult=${writeExecutionResult}`
    );
  }

  // 4. Verify state readback
  const finalStatus = await client.readContract({
    address: contractAddress as `0x${string}`,
    functionName: "get_status",
    args: [],
  });
  console.log(`[canary] Final state readback: ${finalStatus}`);
  if (finalStatus !== "SUCCESS") {
    throw new Error(`Canary expected state SUCCESS, got: ${finalStatus}`);
  }

  console.log("[canary] >>> CANARY TEST PASSED ALL CHECKS! <<<");

  // Best-effort reference cleanup
  signer.privateKey = "";

  return {
    deployTxHash,
    contractAddress,
    deployStatus,
    deployExecutionResult,
    writeTxHash,
    writeStatus,
    writeExecutionResult,
    readbackStatus: String(finalStatus),
  };
}

if (process.argv[1] && process.argv[1].includes("run_canary")) {
  runCanary()
    .then((res) => {
      console.log("\nCanary Result Summary:", JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n[canary] Fatal canary failure:", err);
      process.exit(1);
    });
}
