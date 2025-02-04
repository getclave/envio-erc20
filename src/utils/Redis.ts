/**
 * Copyright Clave - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts, createClient } from "redis";

type Params = {
  host: string;
  port: number;
  username?: string;
  password?: string;
};

export const RedisCacheKeys = {
  WALLETS: "clave:wallets",
  SYNC_SWAP_POOLS: "syncswap:pools",
};

const baseRedisOptions = {
  socket: {
    reconnectStrategy(retries: number): number {
      const delay = Math.min(retries * 50, 2000);
      return delay;
    },
  },
  commandsQueueMaxLength: 10000,
};

export const getRedisInstance = async ({
  host,
  port,
  username = "default",
  password,
  notifyKeyspaceEvents = false,
}: Params & { notifyKeyspaceEvents?: boolean }): Promise<
  RedisClientType<RedisModules, RedisFunctions, RedisScripts>
> => {
  const client = createClient({
    ...baseRedisOptions,
    username,
    password,
    socket: {
      ...baseRedisOptions.socket,
      host,
      port,
    },
  });

  client.on("error", (err) => console.error("Redis Client Error", err));
  await client.connect();

  if (notifyKeyspaceEvents) {
    await client.configSet("notify-keyspace-events", "AKE");
  }

  return client;
};
