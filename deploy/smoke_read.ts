import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import type { Address } from "viem";

const client = createClient({
  endpoint: "https://studio-dev.genlayer.com/api",
  chain: studioDevnet,
});

const addr = "0xA631C30A79e69695a8d17D21F4F2497Ff52522A4" as Address;

async function run() {
  console.log("Reading canonical contract state at:", addr);
  const cfg = await client.readContract({ address: addr, functionName: "get_config", args: [] });
  console.log("get_config:", JSON.stringify(cfg));

  const curr = await client.readContract({ address: addr, functionName: "get_current_release", args: [] });
  console.log("get_current_release:", JSON.stringify(curr));

  const pending = await client.readContract({ address: addr, functionName: "get_pending_proposal", args: [] });
  console.log("get_pending_proposal:", JSON.stringify(pending));

  const histCount = await client.readContract({ address: addr, functionName: "get_history_count", args: [] });
  console.log("get_history_count:", histCount);
  console.log("All safe view methods verified successfully!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
