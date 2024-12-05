const { assertEqualBN } = require("./helper/assert");
const {
  isSha256Hash,
  newSecretHashPair,
  txLoggedArgs,
  sha256,
  bufToStr,
} = require("./helper/utils");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { expectRevert, time } = require("@openzeppelin/test-helpers");

const HTLC = artifacts.require("ForwarderHashedTimelockERC20");
const TokenContract = artifacts.require("AliceERC20");

contract("Forwarding HTLC", (accounts) => {
  const service = accounts[1];
  const user = accounts[2];
  const tokenSupply = 1000;
  const userInitialBalance = 99;

  let htlc, ercToken;

  // some testing data
  const hourSeconds = 3600;
  let timeLock1Hour;

  const tokenAmount = 5;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const EMPTY_BYTES =
    "0x0000000000000000000000000000000000000000000000000000000000000000";

  const assertTokenBalance = async (addr, amount, msg) =>
    assertEqualBN(
      await ercToken.balanceOf.call(addr),
      amount,
      msg ? msg : "wrong token balance",
    );

  const newIncomingHtlc = async ({
    timelock = timeLock1Hour,
    hashlock = newSecretHashPair().hash,
  } = {}) => {
    await ercToken.approve(htlc.address, tokenAmount, { from: user });
    return htlc.route(
      user,
      true,
      hashlock,
      timelock,
      ercToken.address,
      tokenAmount,
      {
        from: user,
      },
    );
  };

  const newOutgoingHtlc = async ({
    timelock = timeLock1Hour,
    hashlock = newSecretHashPair().hash,
  } = {}) => {
    return htlc.route(
      user,
      false,
      hashlock,
      timelock,
      ercToken.address,
      tokenAmount,
      {
        from: service,
      },
    );
  };

  const settleHtlc = async ({ hashlock = newSecretHashPair().secret } = {}) => {
    return htlc.settle(secret, {
      from: service,
    });
  };

  before(async () => {
    timeLock1Hour = (await helpers.time.latest()) + hourSeconds;
    htlc = await HTLC.new(service);

    ercToken = await TokenContract.new(tokenSupply);
    await ercToken.transfer(user, userInitialBalance);
    await assertTokenBalance(
      user,
      userInitialBalance,
      "balance not transferred in before()",
    );
  });

  it("Check initialization & contract owner", async () => {
    const contractOwner = await htlc.owner();
    assert.equal(contractOwner, service, "Owner not set correctly");
    await ercToken.transfer(htlc.address, tokenAmount);
    await assertTokenBalance(
      htlc.address,
      tokenAmount,
      "Wrong Contract balance",
    );
  });
  it("Should fail if non-owner tries to transfer tokens", async () => {
    await expectRevert(
      htlc.transfer(ercToken.address, user, tokenAmount, { from: user }),
      'OwnableUnauthorizedAccount("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")',
    );
  });
  it("Should allow owner to transfer tokens", async () => {
    const receipt = await htlc.transfer(
      ercToken.address,
      service,
      tokenAmount,
      {
        from: service,
      },
    );
    await assertTokenBalance(htlc.address, 0, "Wrong Contract balance");
    await assertTokenBalance(service, tokenAmount, "Wrong Contract balance");
  });
  it("newIncomingHtlc() should create new HTLC forwarding contract and settle it", async () => {
    const hashPair = newSecretHashPair();
    // User deposits into contract
    const newForwardingTx = await newIncomingHtlc({
      hashlock: hashPair.hash,
    });
    // check token balances
    assertTokenBalance(
      user,
      userInitialBalance - tokenAmount,
      "Wrong User balance",
    );
    assertTokenBalance(htlc.address, tokenAmount, "Wrong Contract balance");
    // check event logs
    const logArgsInit = txLoggedArgs(newForwardingTx);
    const paymentId = logArgsInit.hashlock;

    await assert(isSha256Hash(paymentId));
    await assert.equal(logArgsInit.counterparty, user);
    await assert.notEqual(htlc.counterparty, ZERO_ADDRESS);
    const newSettlementTx = await htlc.settle(hashPair.secret, {
      from: service,
    });

    // check event logs
    const logArgsSettle = txLoggedArgs(newSettlementTx);

    await assert(isSha256Hash(paymentId));
    await assert.equal(logArgsSettle.amount, tokenAmount);
    assertTokenBalance(htlc.address, tokenAmount, "Wrong Contract balance");
    //console.log(`HashedTimelockERC20 deployed to ${await htlc.hashlock()}`);
    await assert.equal(await htlc.counterparty(), ZERO_ADDRESS);
    await assert.equal(await htlc.amount(), 0);
    await assert.equal(await htlc.timelock(), 0);
    await assert.equal(await htlc.hashlock(), EMPTY_BYTES);
  });

  it("newOutgoingHtlc() should create new HTLC forwarding contract and settle it", async () => {
    const hashPair = newSecretHashPair();
    // User deposits into contract
    const newForwardingTx = await newOutgoingHtlc({
      hashlock: hashPair.hash,
    });
    // check token balances
    assertTokenBalance(
      service,
      tokenSupply - userInitialBalance - tokenAmount,
      "Wrong User balance",
    );
    assertTokenBalance(htlc.address, tokenAmount, "Wrong Contract balance");
    // check event logs
    const logArgsInit = txLoggedArgs(newForwardingTx);
    const paymentId = logArgsInit.hashlock;

    await assert(isSha256Hash(paymentId));
    await assert.equal(logArgsInit.counterparty, user);
    await assert.notEqual(htlc.counterparty, ZERO_ADDRESS);
    await assertTokenBalance(
      htlc.address,
      tokenAmount,
      "Wrong Contract balance",
    );

    const newSettlementTx = await htlc.settle(hashPair.secret, {
      from: service,
    });

    // check event logs
    const logArgsSettle = txLoggedArgs(newSettlementTx);
    await assert(isSha256Hash(paymentId));
    await assert.equal(logArgsSettle.amount, tokenAmount);
    await assertTokenBalance(htlc.address, 0, "Wrong Contract balance");
    await assertTokenBalance(user, userInitialBalance, "Wrong User balance");
    await assert.equal(await htlc.counterparty(), ZERO_ADDRESS);
    await assert.equal(await htlc.amount(), 0);
    await assert.equal(await htlc.timelock(), 0);
    await assert.equal(await htlc.hashlock(), EMPTY_BYTES);
  });

  it("Wrong preimage on newIncomingHtlc()", async () => {
    const hashPair = newSecretHashPair();
    // User deposits into contract
    const newForwardingTx = await newIncomingHtlc({
      hashlock: hashPair.hash,
    });
    // check token balances
    assertTokenBalance(
      user,
      userInitialBalance - tokenAmount,
      "Wrong User balance",
    );
    assertTokenBalance(htlc.address, tokenAmount, "Wrong Contract balance");
    // check event logs
    const logArgsInit = txLoggedArgs(newForwardingTx);
    const paymentId = logArgsInit.hashlock;

    await assert(isSha256Hash(paymentId));
    await assert.equal(logArgsInit.counterparty, user);
    await assert.notEqual(htlc.counterparty, ZERO_ADDRESS);

    // Default JS way to handle error. Used for illustrative purposes
    try {
      // Attempt to settle with an incorrect preimage
      await htlc.settle(EMPTY_BYTES, { from: service });
      assert.fail("Expected revert not received");
    } catch (error) {
      //
      assert(
        error.message.includes("Hashlock hash does not match"),
        `Unexpected error message: ${error.message}`,
      );
    }

    // Ensure state hasn't changed
    await assertTokenBalance(
      htlc.address,
      tokenAmount,
      "Wrong Contract balance",
    );
  });

  it("Wrong preimage on newOutgoingHtlc() ", async () => {
    const hashPair = newSecretHashPair();
    // User deposits into contract
    const newForwardingTx = await newOutgoingHtlc({
      hashlock: hashPair.hash,
    });
    // check token balances
    assertTokenBalance(
      service,
      tokenSupply - userInitialBalance - tokenAmount,
      "Wrong User balance",
    );
    assertTokenBalance(htlc.address, tokenAmount, "Wrong Contract balance");
    // check event logs
    const logArgsInit = txLoggedArgs(newForwardingTx);
    const paymentId = logArgsInit.hashlock;

    await assert(isSha256Hash(paymentId));
    await assert.equal(logArgsInit.counterparty, user);
    await assert.notEqual(htlc.counterparty, ZERO_ADDRESS);
    await assertTokenBalance(
      htlc.address,
      tokenAmount,
      "Wrong Contract balance",
    );

    // OpenZeppelin library
    await expectRevert(
      htlc.settle(EMPTY_BYTES, { from: service }),
      "Hashlock hash does not match",
    );

    // Ensure state hasn't changed
    await assertTokenBalance(
      htlc.address,
      tokenAmount,
      "Wrong Contract balance",
    );
  });

  it("Test refunds ", async () => {
    const hashPair = newSecretHashPair();
    // User deposits into contract
    const newForwardingTx = await newOutgoingHtlc({
      hashlock: hashPair.hash,
    });
    // check token balances
    assertTokenBalance(
      service,
      tokenSupply - userInitialBalance - tokenAmount,
      "Wrong User balance",
    );
    assertTokenBalance(htlc.address, tokenAmount, "Wrong Contract balance");
    // check event logs
    const logArgsInit = txLoggedArgs(newForwardingTx);
    const paymentId = logArgsInit.hashlock;

    await assert(isSha256Hash(paymentId));
    await assert.equal(logArgsInit.counterparty, user);
    await assert.notEqual(htlc.counterparty, ZERO_ADDRESS);
    await assertTokenBalance(
      htlc.address,
      tokenAmount,
      "Wrong Contract balance",
    );

    await expectRevert(htlc.refund({ from: user }), "Timelock not yet passed");

    // Ensure contract has some tokens (not refunded)
    await assertTokenBalance(
      htlc.address,
      tokenAmount,
      "Wrong Contract balance",
    );

    await time.increaseTo(timeLock1Hour + 1);
    const receipt = await htlc.refund({ from: user });
    const event = receipt.logs.find((log) => log.event === "HTLCERC20Refund");
    assert.equal(
      event.args.amount.toString(),
      tokenAmount.toString(),
      "Refund amount incorrect",
    );

    // Ensure contract has 0 tokens (refunded)
    await assertTokenBalance(htlc.address, 0, "Wrong Contract balance");
  });
});
