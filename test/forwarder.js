const { assertEqualBN } = require('./helper/assert');
const { isSha256Hash, newSecretHashPair, txLoggedArgs } = require('./helper/utils');
const helpers = require('@nomicfoundation/hardhat-network-helpers');

const HTLC = artifacts.require('ForwarderHashedTimelockERC20');
const TokenContract = artifacts.require('AliceERC20');

contract('Forwarding HTLC', (accounts) => {
  const service = accounts[1];
  const user = accounts[2];
  const tokenSupply = 1000;
  const userInitialBalance = 100;

  let htlc, ercToken;

  // some testing data
  const hourSeconds = 3600;
  let timeLock1Hour;
  const tokenAmount = 5;
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const EMPTY_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000';

  const assertTokenBal = async (addr, tokenAmount, msg) => assertEqualBN(await ercToken.balanceOf.call(addr), tokenAmount, msg ? msg : 'wrong token balance');

  before(async () => {
    timeLock1Hour = (await helpers.time.latest()) + hourSeconds;
    htlc = await HTLC.new(service);

    ercToken = await TokenContract.new(tokenSupply);
    await ercToken.transfer(user, userInitialBalance);
    await assertTokenBal(user, userInitialBalance, 'balance not transferred in before()');
  });

  it('newIncomingHtlc() should create new HTLC forwarding contract', async () => {
    const hashPair = newSecretHashPair();
    // User deposits into contract
    const newForwardingTx = await newIncomingHtlc({
      hashlock: hashPair.hash,
    });
    // check token balances
    assertTokenBal(user, userInitialBalance - tokenAmount, "Wrong User balance");
    assertTokenBal(htlc.address, tokenAmount, "Wrong Contract balance");
    // check event logs
    const logArgsInit = txLoggedArgs(newForwardingTx);
    const paymentId = logArgsInit.hashlock;
    await assert(isSha256Hash(paymentId));
    await assert.equal(logArgsInit.counterparty, user);
    await assert.notEqual(htlc.counterparty, ZERO_ADDRESS);
    const newSettlementTx = await htlc.settle(hashPair.secret, { from: service,});

    // check event logs
    const logArgsSettle = txLoggedArgs(newSettlementTx);
    await assert.equal(logArgsSettle.hashlock, paymentId);
    await assert(isSha256Hash(paymentId));
    await assert.equal(logArgsSettle.amount, tokenAmount);
    assertTokenBal(htlc.address, tokenAmount, "Wrong Contract balance");
    //console.log(`HashedTimelockERC20 deployed to ${await htlc.hashlock()}`);
    await assert.equal(await htlc.counterparty(), ZERO_ADDRESS);
    await assert.equal(await htlc.amount(), 0);
    await assert.equal(await htlc.timelock(), 0);
    await assert.equal(await htlc.hashlock(), EMPTY_BYTES);
  });

  const newIncomingHtlc = async ({ timelock = timeLock1Hour, hashlock = newSecretHashPair().hash } = {}) => {
    await ercToken.approve(htlc.address, tokenAmount, { from: user });
    return htlc.requestRouting(user, true, hashlock, timelock, ercToken.address, tokenAmount, {
      from: user,
    });
  };

    const newOutgoingHtlc = async ({ timelock = timeLock1Hour, hashlock = newSecretHashPair().hash } = {}) => {
      return htlc.requestRouting(user, false, hashlock, timelock, ercToken.address, tokenAmount, {
        from: service,
      });
    };

    const settleHtlc = async ({ hashlock = newSecretHashPair().secret } = {}) => {
      return htlc.settle(secret, {
        from: service,
      });
    };
});
