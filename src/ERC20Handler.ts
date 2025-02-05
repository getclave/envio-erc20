/**
 * ERC20Handler.ts
 * Central handler for ERC20 token transfers across different protocols (Syncswap, Venus)
 * Manages token balances, account tracking, and protocol-specific logic for the Clave indexer.
 */

import {
  ERC20,
  AccountIdleBalance,
  Account,
  ERC20_Transfer_event,
  handlerContext,
} from "generated";
import { walletCache } from "./utils/WalletCache";
import { Address } from "viem";
import { VenusPoolAddresses } from "./constants/VenusPools";
import { AavePoolAddresses } from "./constants/AavePools";
import { syncswapCache } from "./utils/SyncswapCache";
import { roundTimestamp } from "./utils/helpers";
import { ClaggMainAddress } from "./constants/ClaggAddresses";

/**
 * Main handler for all ERC20 Transfer events
 * Uses a loader pattern to pre-fetch necessary data for efficiency
 */
ERC20.Transfer.handlerWithLoader({
  /**
   * Loader function to pre-fetch account balances and Clave wallet status
   * Reduces database calls by batching queries
   */
  loader: async ({ event, context }) => {
    const [
      senderBalance,
      receiverBalance,
      claveAddresses,
      senderAccount,
      receiverAccount,
      syncswapPools,
    ] = await Promise.all([
      context.AccountIdleBalance.get(
        event.params.from.toLowerCase() + event.srcAddress.toLowerCase()
      ),
      context.AccountIdleBalance.get(
        event.params.to.toLowerCase() + event.srcAddress.toLowerCase()
      ),
      walletCache.bulkCheckClaveWallets([
        event.params.from.toLowerCase(),
        event.params.to.toLowerCase(),
      ]),
      context.Account.get(event.params.from.toLowerCase()),
      context.Account.get(event.params.to.toLowerCase()),
      syncswapCache.bulkCheckSyncswapPools([event.srcAddress.toLowerCase()]),
    ]);
    return {
      senderBalance,
      receiverBalance,
      claveAddresses,
      senderAccount,
      receiverAccount,
      syncswapPools,
    };
  },

  /**
   * Main transfer event handler
   * Routes transfers to appropriate protocol handlers and manages account balances
   */
  handler: async ({ event, context, loaderReturn }) => {
    try {
      let { claveAddresses, senderAccount, receiverAccount, syncswapPools } = loaderReturn as {
        claveAddresses: Set<string>;
        senderAccount: Account;
        receiverAccount: Account;
        syncswapPools: Set<string>;
      };

      if (event.params.from === event.params.to) {
        return;
      }

      if (process.env.NODE_ENV == "test") {
        claveAddresses = new Set([event.params.from.toLowerCase(), event.params.to.toLowerCase()]);
        loaderReturn.claveAddresses = claveAddresses;
      }

      if (!claveAddresses || claveAddresses.size === 0) {
        return;
      }

      const fromAddress = event.params.from.toLowerCase();
      const toAddress = event.params.to.toLowerCase();
      const srcAddress = event.srcAddress.toLowerCase() as Address;

      // Create accounts for new Clave users
      if (!senderAccount && claveAddresses.has(fromAddress)) {
        context.Account.set({
          id: fromAddress,
          address: fromAddress,
        });
      }

      if (!receiverAccount && claveAddresses.has(toAddress)) {
        context.Account.set({
          id: toAddress,
          address: toAddress,
        });
      }

      if (process.env.NODE_ENV == "test" && process.env.TEST_MODE == "syncswap") {
        syncswapPools = new Set([srcAddress.toLowerCase()]);
        loaderReturn.syncswapPools = syncswapPools;
      }

      if (syncswapPools.has(srcAddress.toLowerCase())) {
        return;
      }

      if (ClaggMainAddress.toLowerCase() == srcAddress.toLowerCase()) {
        return;
      }

      if (VenusPoolAddresses.includes(srcAddress.toLowerCase() as Address)) {
        return;
      }

      if (AavePoolAddresses.includes(srcAddress.toLowerCase() as Address)) {
        return;
      }

      await PlainTransferHandler(event, context, loaderReturn);
    } catch (error) {
      context.log.error(`Error in ERC20 Transfer handler: ${error}`);
      throw error;
    }
  },

  wildcard: true,
});

/**
 * Handles plain ERC20 transfers not associated with specific protocols
 * Updates account balances and maintains historical balance records
 * @param event The transfer event details
 * @param context The handler context
 * @param loaderReturn Pre-loaded data including balances and Clave addresses
 */
async function PlainTransferHandler(
  event: ERC20_Transfer_event,
  context: handlerContext,
  loaderReturn: any
) {
  const { claveAddresses, senderBalance, receiverBalance } = loaderReturn;

  if (claveAddresses.has(event.params.from.toLowerCase())) {
    const previousBalance: AccountIdleBalance = {
      id: event.params.from.toLowerCase() + event.srcAddress.toLowerCase(),
      balance: senderBalance == undefined ? 0n : senderBalance.balance,
      address: event.params.from.toLowerCase(),
      token: event.srcAddress.toLowerCase(),
    };
    // Update sender's balance
    const accountObject: AccountIdleBalance = {
      ...previousBalance,
      balance: previousBalance.balance - event.params.value,
    };

    context.AccountIdleBalance.set(accountObject);
    setHistoricalBalance(previousBalance, context, event.block.timestamp);
  }

  if (claveAddresses.has(event.params.to.toLowerCase())) {
    const previousBalance: AccountIdleBalance = {
      id: event.params.to.toLowerCase() + event.srcAddress.toLowerCase(),
      balance: receiverBalance == undefined ? 0n : receiverBalance.balance,
      address: event.params.to.toLowerCase(),
      token: event.srcAddress.toLowerCase(),
    };
    // Update receiver's balance
    const accountObject: AccountIdleBalance = {
      ...previousBalance,
      balance: previousBalance.balance + event.params.value,
    };

    context.AccountIdleBalance.set(accountObject);
    setHistoricalBalance(previousBalance, context, event.block.timestamp);
  }
}

function setHistoricalBalance(
  accountObject: AccountIdleBalance,
  context: handlerContext,
  timestamp: number
) {
  context.HistoricalAccountIdleBalance4Hours.set({
    ...accountObject,
    id: accountObject.id + roundTimestamp(timestamp, 3600 * 4),
    timestamp: BigInt(roundTimestamp(timestamp, 3600 * 4)),
  });
  context.HistoricalAccountIdleBalance1Day.set({
    ...accountObject,
    id: accountObject.id + roundTimestamp(timestamp),
    timestamp: BigInt(roundTimestamp(timestamp)),
  });
  context.HistoricalAccountIdleBalance1Week.set({
    ...accountObject,
    id: accountObject.id + roundTimestamp(timestamp, 86400 * 7),
    timestamp: BigInt(roundTimestamp(timestamp, 86400 * 7)),
  });
  context.HistoricalAccountIdleBalance1Month.set({
    ...accountObject,
    id: accountObject.id + roundTimestamp(timestamp, 86400 * 30),
    timestamp: BigInt(roundTimestamp(timestamp, 86400 * 30)),
  });
}
