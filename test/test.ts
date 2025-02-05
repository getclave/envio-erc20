import assert from "assert";
import { TestHelpers, AccountIdleBalance } from "generated";
import { zeroAddress } from "viem";
import { VenusPoolAddresses } from "../src/constants/VenusPools";
import { AavePoolAddresses } from "../src/constants/AavePools";
import { ClaggMainAddress } from "../src/constants/ClaggAddresses";
import { roundTimestamp } from "../src/utils/helpers";

const { MockDb, ERC20, Addresses } = TestHelpers;

process.env.NODE_ENV = "test";

describe("ERC20Handler", () => {
  // Common test setup
  const mockDbEmpty = MockDb.createMockDb();
  const tokenId = "0x0000000000000000000000B4s00000000Ac000001";
  const userAddress1 = Addresses.mockAddresses[0];
  const userAddress2 = Addresses.mockAddresses[1];

  // Initial test state
  const mockAccountIdleBalanceEntity: AccountIdleBalance = {
    id: userAddress1.toLowerCase() + tokenId.toLowerCase(),
    balance: 5n,
    address: userAddress1.toLowerCase(),
    token: tokenId.toLowerCase(),
  };

  const mockDb = mockDbEmpty.entities.AccountIdleBalance.set(mockAccountIdleBalanceEntity);

  describe("Basic Transfers", () => {
    it("should handle transfer between two different users", async () => {
      const mockTransfer = ERC20.Transfer.createMockEvent({
        from: userAddress1,
        to: userAddress2,
        value: 3n,
        mockEventData: {
          srcAddress: tokenId,
        },
      });

      const mockDbAfterTransfer = await ERC20.Transfer.processEvent({
        event: mockTransfer,
        mockDb,
      });

      // Check sender balance
      const account1Balance = mockDbAfterTransfer.entities.AccountIdleBalance.get(
        userAddress1.toLowerCase() + mockTransfer.srcAddress.toLowerCase()
      )?.balance;
      assert.equal(account1Balance, 2n, "Should subtract transfer amount from sender");

      // Check receiver balance
      const account2Balance = mockDbAfterTransfer.entities.AccountIdleBalance.get(
        userAddress2.toLowerCase() + mockTransfer.srcAddress.toLowerCase()
      )?.balance;
      assert.equal(account2Balance, 3n, "Should add transfer amount to receiver");

      // Verify accounts were created
      const account1 = mockDbAfterTransfer.entities.Account.get(
        userAddress1.toLowerCase()
      )?.address;
      assert.equal(account1, userAddress1.toLowerCase(), "Sender account should exist");

      const account2 = mockDbAfterTransfer.entities.Account.get(
        userAddress2.toLowerCase()
      )?.address;
      assert.equal(account2, userAddress2.toLowerCase(), "Receiver account should exist");
    });

    it("should handle transfer to self (same address)", async () => {
      const mockTransfer = ERC20.Transfer.createMockEvent({
        from: userAddress1,
        to: userAddress1,
        value: 3n,
        mockEventData: {
          srcAddress: tokenId,
        },
      });

      const mockDbAfterTransfer = await ERC20.Transfer.processEvent({
        event: mockTransfer,
        mockDb,
      });

      const balance = mockDbAfterTransfer.entities.AccountIdleBalance.get(
        userAddress1.toLowerCase() + mockTransfer.srcAddress.toLowerCase()
      )?.balance;
      assert.equal(balance, 5n, "Balance should remain unchanged for self-transfer");
    });
  });

  describe("Minting and Burning", () => {
    it("should handle minting (transfer from zero address)", async () => {
      const mockMint = ERC20.Transfer.createMockEvent({
        from: zeroAddress,
        to: userAddress1,
        value: 10n,
        mockEventData: {
          srcAddress: tokenId,
        },
      });

      const mockDbAfterMint = await ERC20.Transfer.processEvent({
        event: mockMint,
        mockDb: mockDbEmpty,
      });

      const balance = mockDbAfterMint.entities.AccountIdleBalance.get(
        userAddress1.toLowerCase() + tokenId.toLowerCase()
      )?.balance;
      assert.equal(balance, 10n, "Should add minted amount to receiver");
    });

    it("should handle burning (transfer to zero address)", async () => {
      const mockBurn = ERC20.Transfer.createMockEvent({
        from: userAddress1,
        to: zeroAddress,
        value: 3n,
        mockEventData: {
          srcAddress: tokenId,
        },
      });

      const mockDbAfterBurn = await ERC20.Transfer.processEvent({
        event: mockBurn,
        mockDb,
      });

      const balance = mockDbAfterBurn.entities.AccountIdleBalance.get(
        userAddress1.toLowerCase() + tokenId.toLowerCase()
      )?.balance;
      assert.equal(balance, 2n, "Should subtract burned amount from sender");
    });
  });

  describe("Edge Cases", () => {
    it("should handle transfer with zero value", async () => {
      const mockTransfer = ERC20.Transfer.createMockEvent({
        from: userAddress1,
        to: userAddress2,
        value: 0n,
        mockEventData: {
          srcAddress: tokenId,
        },
      });

      const mockDbAfterTransfer = await ERC20.Transfer.processEvent({
        event: mockTransfer,
        mockDb,
      });

      const senderBalance = mockDbAfterTransfer.entities.AccountIdleBalance.get(
        userAddress1.toLowerCase() + tokenId.toLowerCase()
      )?.balance;
      assert.equal(senderBalance, 5n, "Sender balance should remain unchanged");

      const receiverBalance = mockDbAfterTransfer.entities.AccountIdleBalance.get(
        userAddress2.toLowerCase() + tokenId.toLowerCase()
      )?.balance;
      assert.equal(receiverBalance ?? 0n, 0n, "Receiver should not get any balance");
    });
  });

  describe("Protocol-Specific Transfers", () => {
    it("should return early for Venus pool transfers", async () => {
      const mockTransfer = ERC20.Transfer.createMockEvent({
        from: userAddress1,
        to: userAddress2,
        value: 3n,
        mockEventData: {
          srcAddress: VenusPoolAddresses[0],
        },
      });

      const mockDbAfterTransfer = await ERC20.Transfer.processEvent({
        event: mockTransfer,
        mockDb,
      });

      // Verify no balances were updated
      const senderBalance = mockDbAfterTransfer.entities.AccountIdleBalance.get(
        userAddress1.toLowerCase() + VenusPoolAddresses[0].toLowerCase()
      )?.balance;
      assert.equal(senderBalance, undefined, "Venus transfer should not affect sender balance");

      const receiverBalance = mockDbAfterTransfer.entities.AccountIdleBalance.get(
        userAddress2.toLowerCase() + VenusPoolAddresses[0].toLowerCase()
      )?.balance;
      assert.equal(receiverBalance, undefined, "Venus transfer should not affect receiver balance");
    });

    it("should return early for Aave pool transfers", async () => {
      const mockTransfer = ERC20.Transfer.createMockEvent({
        from: userAddress1,
        to: userAddress2,
        value: 3n,
        mockEventData: {
          srcAddress: AavePoolAddresses[0],
        },
      });

      const mockDbAfterTransfer = await ERC20.Transfer.processEvent({
        event: mockTransfer,
        mockDb,
      });

      // Verify no balances were updated
      const senderBalance = mockDbAfterTransfer.entities.AccountIdleBalance.get(
        userAddress1.toLowerCase() + AavePoolAddresses[0].toLowerCase()
      )?.balance;
      assert.equal(senderBalance, undefined, "Aave transfer should not affect sender balance");

      const receiverBalance = mockDbAfterTransfer.entities.AccountIdleBalance.get(
        userAddress2.toLowerCase() + AavePoolAddresses[0].toLowerCase()
      )?.balance;
      assert.equal(receiverBalance, undefined, "Aave transfer should not affect receiver balance");
    });

    it("should return early for Clagg transfers", async () => {
      const mockTransfer = ERC20.Transfer.createMockEvent({
        from: userAddress1,
        to: userAddress2,
        value: 3n,
        mockEventData: {
          srcAddress: ClaggMainAddress,
        },
      });

      const mockDbAfterTransfer = await ERC20.Transfer.processEvent({
        event: mockTransfer,
        mockDb,
      });

      // Verify no balances were updated
      const senderBalance = mockDbAfterTransfer.entities.AccountIdleBalance.get(
        userAddress1.toLowerCase() + ClaggMainAddress.toLowerCase()
      )?.balance;
      assert.equal(senderBalance, undefined, "Clagg transfer should not affect sender balance");

      const receiverBalance = mockDbAfterTransfer.entities.AccountIdleBalance.get(
        userAddress2.toLowerCase() + ClaggMainAddress.toLowerCase()
      )?.balance;
      assert.equal(receiverBalance, undefined, "Clagg transfer should not affect receiver balance");
    });

    it("should return early for Syncswap pool transfers", async () => {
      process.env.TEST_MODE = "syncswap";

      const mockTransfer = ERC20.Transfer.createMockEvent({
        from: userAddress1,
        to: userAddress2,
        value: 3n,
        mockEventData: {
          srcAddress: "0x0259d9dfb638775858b1d072222237e2ce7111C0", // Example Syncswap pool address
        },
      });

      const mockDbAfterTransfer = await ERC20.Transfer.processEvent({
        event: mockTransfer,
        mockDb,
      });

      // Verify no balances were updated
      const senderBalance = mockDbAfterTransfer.entities.AccountIdleBalance.get(
        userAddress1.toLowerCase() + mockTransfer.srcAddress.toLowerCase()
      )?.balance;
      assert.equal(senderBalance, undefined, "Syncswap transfer should not affect sender balance");

      const receiverBalance = mockDbAfterTransfer.entities.AccountIdleBalance.get(
        userAddress2.toLowerCase() + mockTransfer.srcAddress.toLowerCase()
      )?.balance;
      assert.equal(
        receiverBalance,
        undefined,
        "Syncswap transfer should not affect receiver balance"
      );

      process.env.TEST_MODE = "default"; // Reset test mode
    });
  });

  describe("Historical Balance Tracking", () => {
    it("should create historical records for transfers", async () => {
      const mockTransfer = ERC20.Transfer.createMockEvent({
        from: userAddress1,
        to: userAddress2,
        value: 3n,
        mockEventData: {
          srcAddress: tokenId,
          block: {
            timestamp: 1000,
          },
        },
      });

      const mockDbAfterTransfer = await ERC20.Transfer.processEvent({
        event: mockTransfer,
        mockDb,
      });

      // Check historical record for sender
      const senderHistoricalBalance =
        mockDbAfterTransfer.entities.HistoricalAccountIdleBalance4Hours.get(
          userAddress1.toLowerCase() +
            tokenId.toLowerCase() +
            roundTimestamp(1000, 3600 * 4).toString()
        );
      assert.equal(
        senderHistoricalBalance?.timestamp,
        BigInt(roundTimestamp(1000, 3600 * 4)),
        "Should create historical record with rounded timestamp for sender"
      );

      // Check historical record for receiver
      const receiverHistoricalBalance =
        mockDbAfterTransfer.entities.HistoricalAccountIdleBalance4Hours.get(
          userAddress2.toLowerCase() +
            tokenId.toLowerCase() +
            roundTimestamp(1000, 3600 * 4).toString()
        );
      assert.equal(
        receiverHistoricalBalance?.timestamp,
        BigInt(roundTimestamp(1000, 3600 * 4)),
        "Should create historical record with rounded timestamp for receiver"
      );
    });

    it("should handle multiple transfers in the same hour", async () => {
      // First transfer at 1000 seconds
      const mockTransfer1 = ERC20.Transfer.createMockEvent({
        from: userAddress1,
        to: userAddress2,
        value: 2n,
        mockEventData: {
          srcAddress: tokenId,
          block: {
            timestamp: 1000,
          },
        },
      });

      let mockDbAfterTransfer = await ERC20.Transfer.processEvent({
        event: mockTransfer1,
        mockDb,
      });

      // Second transfer at 2000 seconds (same hour)
      const mockTransfer2 = ERC20.Transfer.createMockEvent({
        from: userAddress1,
        to: userAddress2,
        value: 1n,
        mockEventData: {
          srcAddress: tokenId,
          block: {
            timestamp: 2000,
          },
        },
      });

      mockDbAfterTransfer = await ERC20.Transfer.processEvent({
        event: mockTransfer2,
        mockDb: mockDbAfterTransfer,
      });

      // Both transfers should create only one historical record per address for that hour
      const senderHistoricalBalance =
        mockDbAfterTransfer.entities.HistoricalAccountIdleBalance4Hours.get(
          userAddress1.toLowerCase() +
            tokenId.toLowerCase() +
            roundTimestamp(1000, 3600 * 4).toString()
        );
      assert.equal(
        senderHistoricalBalance?.timestamp,
        BigInt(roundTimestamp(1000, 3600 * 4)),
        "Should have one historical record for multiple transfers in same hour"
      );
    });

    it("should create separate historical records for different hours", async () => {
      // First transfer at hour 1
      const mockTransfer1 = ERC20.Transfer.createMockEvent({
        from: userAddress1,
        to: userAddress2,
        value: 2n,
        mockEventData: {
          srcAddress: tokenId,
          block: {
            timestamp: 3600,
          },
        },
      });

      let mockDbAfterTransfer = await ERC20.Transfer.processEvent({
        event: mockTransfer1,
        mockDb,
      });

      // Second transfer at hour 2
      const mockTransfer2 = ERC20.Transfer.createMockEvent({
        from: userAddress1,
        to: userAddress2,
        value: 1n,
        mockEventData: {
          srcAddress: tokenId,
          block: {
            timestamp: 7200,
          },
        },
      });

      mockDbAfterTransfer = await ERC20.Transfer.processEvent({
        event: mockTransfer2,
        mockDb: mockDbAfterTransfer,
      });

      // Check historical record for first hour
      const firstHourBalance = mockDbAfterTransfer.entities.HistoricalAccountIdleBalance4Hours.get(
        userAddress1.toLowerCase() +
          tokenId.toLowerCase() +
          roundTimestamp(3600, 3600 * 4).toString()
      );
      assert.equal(
        firstHourBalance?.timestamp,
        BigInt(roundTimestamp(3600, 3600 * 4)),
        "Should have historical record for first hour"
      );

      // Check historical record for second hour
      const secondHourBalance = mockDbAfterTransfer.entities.HistoricalAccountIdleBalance4Hours.get(
        userAddress1.toLowerCase() +
          tokenId.toLowerCase() +
          roundTimestamp(7200, 3600 * 4).toString()
      );
      assert.equal(
        secondHourBalance?.timestamp,
        BigInt(roundTimestamp(7200, 3600 * 4)),
        "Should have historical record for second hour"
      );
    });
  });
});
