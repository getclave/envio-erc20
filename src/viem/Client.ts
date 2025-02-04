import { createPublicClient, fallback, http } from "viem";
import { zksync } from "viem/chains";

const isFallbackDefined = process.env.ENVIO_FALLBACK_URL !== undefined;

const client1 = createPublicClient({
  chain: zksync,
  transport: http("https://mainnet.era.zksync.io", {
    batch: true,
    retryCount: 10,
    retryDelay: 150,
  }),
  batch: { multicall: true },
});

const client2 = createPublicClient({
  chain: zksync,
  transport: fallback([
    http(process.env.ENVIO_FALLBACK_URL, {
      batch: true,
      retryCount: 10,
      retryDelay: 150,
    }),
    http("https://mainnet.era.zksync.io", {
      batch: true,
      retryCount: 10,
      retryDelay: 150,
    }),
  ]),
  batch: { multicall: true },
});

export const client = isFallbackDefined ? client2 : client1;
