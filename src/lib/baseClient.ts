import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { env } from "@/lib/env";

export const baseClient = createPublicClient({
  chain: base,
  transport: http(env.BASE_RPC_URL),
});
