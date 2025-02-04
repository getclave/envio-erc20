/**
 * WalletCache.ts
 * Implements a Redis-backed caching system for Clave wallet addresses
 * Provides fast lookup of wallet addresses with both in-memory and Redis persistence
 */

import { getRedisInstance } from "./Redis";

/**
 * WalletCache class manages a dual-layer caching system for wallet addresses
 * Uses both in-memory cache for fast lookups and Redis for persistence
 * Maintains real-time synchronization between Redis and in-memory cache
 */
class WalletCache {
  private readonly CACHE_KEY = "clave:wallets";
  private redisCommand: Awaited<ReturnType<typeof getRedisInstance>> | undefined;
  private redisSub: Awaited<ReturnType<typeof getRedisInstance>> | undefined;
  private inMemoryCache: Set<string> = new Set();
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    // Create the promise immediately and store it
    this.initializationPromise = this.initialize();

    // Execute the promise
    this.initializationPromise.catch((error) => {
      console.error("Failed to initialize WalletCache:", error);
    });
  }

  /**
   * Initializes Redis connections and sets up the cache
   * Creates separate connections for commands and subscriptions
   * Loads initial data and sets up real-time updates
   */
  private async initialize() {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    if (this.redisCommand && this.redisSub) {
      return;
    }

    console.log("Starting Redis initialization");

    // Create two connections - one for subscribing and one for getting data
    const [commandClient, subClient] = await Promise.all([
      getRedisInstance({
        host:
          process.env.ENVIO_REDIS_HOST ||
          "redis-12945.c300.eu-central-1-1.ec2.redns.redis-cloud.com",
        port: parseInt(process.env.ENVIO_REDIS_PORT || "12945"),
        username: process.env.ENVIO_REDIS_USERNAME || "default",
        password: process.env.ENVIO_REDIS_PASSWORD || "YPbmBSP7lBumkk4oL6djJH4tfowkpDNo",
        notifyKeyspaceEvents: true,
      }),
      getRedisInstance({
        host:
          process.env.ENVIO_REDIS_HOST ||
          "redis-12945.c300.eu-central-1-1.ec2.redns.redis-cloud.com",
        port: parseInt(process.env.ENVIO_REDIS_PORT || "12945"),
        username: process.env.ENVIO_REDIS_USERNAME || "default",
        password: process.env.ENVIO_REDIS_PASSWORD || "YPbmBSP7lBumkk4oL6djJH4tfowkpDNo",
      }),
    ]);

    this.redisCommand = commandClient;
    this.redisSub = subClient;

    await this.updateInMemoryCache();
    await this.subscribeToSetOperations();

    console.log("Redis initialization complete");
  }

  /**
   * Updates the in-memory cache with current Redis data
   * Synchronizes the local cache with the persistent storage
   */
  private async updateInMemoryCache() {
    console.log("updating in memory cache");
    const members = await this.redisCommand!.sMembers(this.CACHE_KEY);
    this.inMemoryCache = new Set(members);
  }

  /**
   * Sets up real-time subscription to Redis set operations
   * Ensures in-memory cache stays synchronized with Redis updates
   */
  private async subscribeToSetOperations() {
    const keyspaceChannel = `__keyspace@0__:${this.CACHE_KEY}`;

    try {
      await this.redisSub!.subscribe(keyspaceChannel, (message) => {
        if (message !== "sadd") {
          return;
        }
        this.updateInMemoryCache().catch((error) => {
          console.error("Failed to update in-memory cache:", error);
        });
      });
      console.log(`Subscribed to ${keyspaceChannel}`);
    } catch (error) {
      console.error("Failed to subscribe to keyspace events:", error);
    }
  }

  /**
   * Checks multiple addresses against the cache in bulk
   * Uses in-memory cache for fast lookups
   * @param addresses Array of addresses to check
   * @returns Set of addresses that are Clave wallets
   */
  async bulkCheckClaveWallets(addresses: Array<string>): Promise<Set<string>> {
    if (!this.redisCommand) {
      await this.initialize();
    }

    try {
      const claveAddresses = new Set<string>();
      const lowercaseAddresses = addresses.map((addr) => addr.toLowerCase());

      lowercaseAddresses.forEach((address) => {
        const isMember = this.inMemoryCache.has(address);
        if (isMember) {
          claveAddresses.add(address);
        }
      });

      return claveAddresses;
    } catch (error) {
      console.error("Failed to bulk check wallets", error);
      return new Set<string>();
    }
  }
}

// Single instance exported - this will trigger initialization
export const walletCache = new WalletCache();
