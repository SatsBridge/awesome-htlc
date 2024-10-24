import { expect } from "chai";
import { Address, Contract, getRandomNonce, Signer, toNano, WalletTypes } from "locklift";
import { FactorySource } from "../build/factorySource";

const { createHash, randomBytes } = require("crypto");

let htlc: Contract<FactorySource["HTLCForwarder"]>;
let tokenRootAddress: Address;
let tokenRoot: Contract<TokenRootUpgradeableAbi>;
let owner: Signer;
let counterparty: Signer;
let userWallet: { signer: Signer; account: Account };
let ownerWallet: { signer: Signer; account: Account };

let ownerTip3Wallet: Contract<FactorySource["TokenWalletUpgradeable"]>;
let ownerTip3WalletAddress: Address;
let userTip3Wallet: Contract<FactorySource["TokenWalletUpgradeable"]>;
let userTip3WalletAddress: Address;
let htlcTip3Wallet: Contract<FactorySource["TokenWalletUpgradeable"]>;
let htlcTip3WalletAddress: Address;
const accountAddress = process.env.ACCOUNT;

const bufToStr = b => "0x" + b.toString("hex");
const timer = ms => new Promise(res => setTimeout(res, ms));

const PAYMENT_PREIMAGE = randomBytes(32);
const TEST_PAYMENT_SHA = createHash("sha256").update(PAYMENT_PREIMAGE).digest();
const TEST_PAYMENT_RIPE = createHash("ripemd160").update(TEST_PAYMENT_SHA).digest();

console.log(`Hash - Preimage pair
${bufToStr(TEST_PAYMENT_SHA)} / ${bufToStr(TEST_PAYMENT_RIPE)} / ${bufToStr(PAYMENT_PREIMAGE)}`)

type DeployRootParams = { signer: Signer; owner: Address };

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const deployTokenRoot = async ({
  signer,
  owner,
}: DeployRootParams): Promise<Contract<TokenRootUpgradeableAbi>> => {
  const TOKEN_ROOT_NAME = "StEver";
  const TOKEN_ROOT_SYMBOL = "STE";
  const ZERO_ADDRESS = new Address("0:0000000000000000000000000000000000000000000000000000000000000000");
  const tokenWalletCode = locklift.factory.getContractArtifacts("TokenWalletUpgradeable");
  const platformCode = locklift.factory.getContractArtifacts("TokenWalletPlatform");

  const { contract } = await locklift.factory.deployContract({
    contract: "TokenRootUpgradeable",
    initParams: {
      name_: TOKEN_ROOT_NAME,
      symbol_: TOKEN_ROOT_SYMBOL,
      decimals_: 9,
      rootOwner_: owner,
      walletCode_: tokenWalletCode.code,
      randomNonce_: locklift.utils.getRandomNonce(),
      deployer_: ZERO_ADDRESS,
      platformCode_: platformCode.code,
    },
    publicKey: signer.publicKey,
    value: locklift.utils.toNano(2),
    constructorParams: {
      initialSupplyTo: owner,
      initialSupply: toNano(123),
      deployWalletValue: toNano(0.1), //required for initial supply to be distributed to ownerWallet
      mintDisabled: false,
      burnByRootDisabled: false,
      burnPaused: false,
      remainingGasTo: owner,
    },
  });
  return contract;
};

describe("Test HTLC forwarder contract", async function () {
  const zeroAddress = new Address("0:0000000000000000000000000000000000000000000000000000000000000000");
  before(async () => {
    owner = (await locklift.keystore.getSigner("0"))!;
    ownerWallet = {
      signer: owner,
      account: accountAddress
        ? await locklift.factory.accounts.addExistingAccount({
            type: WalletTypes.EverWallet,
            address: new Address(accountAddress),
          })
        : await locklift.factory.accounts
            .addNewAccount({
              type: WalletTypes.EverWallet,
              value: toNano(10),
              publicKey: owner.publicKey,
            })
            .then(res => res.account),
    };

    counterparty = (await locklift.keystore.getSigner("1"))!;
    userWallet = {
      signer: counterparty,
      account: accountAddress
        ? await locklift.factory.accounts.addExistingAccount({
            type: WalletTypes.EverWallet, // or WalletTypes.HighLoadWallet,
            address: new Address(accountAddress),
          })
        : await locklift.factory.accounts
            .addNewAccount({
              type: WalletTypes.EverWallet,
              value: toNano(10),
              publicKey: counterparty.publicKey,
            })
            .then(res => res.account),
    };

    expect(await locklift.provider.getBalance(userWallet.account.address).then(balance => Number(balance))).to.be.above(
      0,
    );

    tokenRoot = await deployTokenRoot({ signer: owner, owner: ownerWallet.account.address });
    tokenRootAddress = tokenRoot.address;
    //console.log({signer: ownerWallet.signer,accountAddress: ownerWallet.account.address,});
    //console.log(`TIP3 Token: ${tokenRoot.address}`);
  });

  describe("Wallets", async function () {
    it("Test EverWallets", async function () {
      await locklift.provider.sendMessage({
        sender: userWallet.account.address,
        recipient: ownerWallet.account.address,
        amount: toNano(1),
        bounce: false,
      });
      // console.log(`ownerWallet: ${ await locklift.provider.getBalance(ownerWallet.account.address)}`);
    });
    it("Deploy User's TokenWallet ", async function () {
      const deployTokenWalletForUserTX = await locklift.transactions.waitFinalized(
        tokenRoot.methods
          .deployWallet({
            answerId: 0,
            walletOwner: userWallet.account.address,
            deployWalletValue: toNano(0.1),
          })
          .send({
            from: userWallet.account.address,
            amount: toNano(0.2), // 1 ever
          }),
      );
      //console.log(`Deploy wallet: ${deployTokenWalletForUserTX}`);
    });
  });

  describe("TIP3 contract", async function () {
    it("Test deploy", async function () {
      const tokenBalance = await locklift.provider.getBalance(tokenRoot.address).then(Number);
      expect(tokenBalance).to.be.above(0);
      console.log(`TIP3 Token: ${tokenRoot.address}`);
      console.log(`Balance: ${tokenBalance}`);
    });
    it("Token transaction test", async function () {
      ownerTip3WalletAddress = (
        await tokenRoot.methods.walletOf({ answerId: 0, walletOwner: ownerWallet.account.address }).call()
      ).value0;
      ownerTip3Wallet = locklift.factory.getDeployedContract("TokenWalletUpgradeable", ownerTip3WalletAddress);

      const transferTokenTX = await locklift.transactions.waitFinalized(
        ownerTip3Wallet.methods
          .transfer({
            amount: toNano(1.1111),
            payload: "",
            notify: true,
            remainingGasTo: ownerWallet.account.address,
            recipient: userWallet.account.address,
            deployWalletValue: toNano(0), // may be 0 because TokenWallet is already deployed
          })
          .send({
            from: ownerWallet.account.address,
            amount: toNano(0.1), // 1 ever
          }),
      );
    });
    it("TokenWallet balances check (and deploy test)", async function () {
      userTip3WalletAddress = (
        await tokenRoot.methods.walletOf({ answerId: 0, walletOwner: userWallet.account.address }).call()
      ).value0;
      userTip3Wallet = locklift.factory.getDeployedContract("TokenWalletUpgradeable", userTip3WalletAddress);

      const { value0: ownerTokenBalance } = await ownerTip3Wallet.methods.balance({ answerId: 0 }).call();
      expect(ownerTokenBalance).to.be.equals(
        toNano(121.8889).toString(),
        "Owner wallet amount should be equal to the amount of initial supply minus transferred amount",
      );

      const { value0: userTokenBalance } = await userTip3Wallet.methods.balance({ answerId: 0 }).call();
      expect(userTokenBalance).to.be.equals(
        toNano(1.1111).toString(),
        "User wallet amount should be equal to the amount transferred",
      );
      //console.log(`OwnerTip3Wallet Address: ${ownerTip3WalletAddress}`);
      //console.log(`OwnerTip3Wallet Balance: ${ownerTokenBalance}`);
    });
  });

  describe("Test HTLC Forwarder contract", async function () {
    it("Load HTLC contract factory", async function () {
      const contractData = await locklift.factory.getContractArtifacts("HTLCForwarder");
      expect(contractData.code).not.to.equal(undefined, "Code should be available");
      expect(contractData.abi).not.to.equal(undefined, "ABI should be available");
      expect(contractData.tvc).not.to.equal(undefined, "tvc should be available");
    });

    it("Deploy HTLC contract", async function () {
      const { contract } = await locklift.tracing.trace(
        locklift.factory.deployContract({
          contract: "HTLCForwarder",
          publicKey: owner.publicKey,
          initParams: {
            _randomNonce: locklift.utils.getRandomNonce(),
            tokenRoot_: tokenRootAddress,
          },
          constructorParams: {
            _owner: ownerWallet.account.address,
          },
          value: locklift.utils.toNano(2),
        }),
      );
      htlc = contract;
      const tokenBalance = await locklift.provider.getBalance(htlc.address).then(Number);
      expect(tokenBalance).to.be.above(0);
      console.log(`HTLC: ${htlc.address}`);
      console.log(`Balance: ${tokenBalance}`);

      await locklift.provider.sendMessage({
        sender: userWallet.account.address,
        recipient: htlc.address,
        amount: toNano(5),
        bounce: false,
      });

      const tokenBalanceAfter = await locklift.provider.getBalance(htlc.address).then(Number);
      expect(tokenBalanceAfter).to.be.above(0);
      console.log(`HTLC: ${htlc.address}`);
      console.log(`Balance: ${tokenBalanceAfter}`);
    });
    it("Check deploy of TokenWallet for TIP3", async function () {
      htlcTip3WalletAddress = (await tokenRoot.methods.walletOf({ answerId: 0, walletOwner: htlc.address }).call())
        .value0;
      console.log(`Deployed TIP3 Token Wallet address ${htlcTip3WalletAddress}`);
    });
    it("Check deployment: get HTLC contract state (zeroes)", async function () {
      const response = await htlc.methods.getDetails({}).call();
      // Check for corect HTLC contract TIP3 address
      expect(response.tokenWallet.equals(htlcTip3WalletAddress), "Wrong state");
      expect(response.tokenRoot.equals(tokenRootAddress), "Wrong state");
      // Check for zeroes
      expect(response.counterparty.equals(zeroAddress), "Wrong state");
      expect(Number(response.amount)).to.be.equal(0, "Wrong state");
      expect(Number(response.hashlock)).to.be.equal(0, "Wrong state");
      expect(Number(response.timelock)).to.be.equal(0, "Wrong state");
    });

    it("Pushing incorrect payload into HTLC", async function () {
      const now = Math.floor((Date.now())/1000);
      const htlcPayload = (
        await locklift.provider.packIntoCell({
          data: {
            _incoming: true,
            _counterparty: true,
            _hashlock: bufToStr(TEST_PAYMENT_SHA),
            _timelock: now + 3600,
          },
          structure: [
            { name: "_incoming", type: "bool" },
            { name: "_counterparty", type: "bool" },
            { name: "_hashlock", type: "uint256" },
            { name: "_timelock", type: "uint64" },
          ] as const,
          abiVersion: "2.3",
        })
      ).boc;
      console.log(htlcPayload)
      const { traceTree } = await locklift.tracing.trace(
        ownerTip3Wallet.methods
          .transfer({
            amount: toNano(0.1),
            recipient: htlc.address,
            deployWalletValue: 0,
            remainingGasTo: ownerWallet.account.address,
            notify: true,
            payload: htlcPayload,
          })
          .send({
            from: ownerWallet.account.address,
            amount: locklift.utils.toNano(1),
          }),
        {
          raise: false,
          allowedCodes: {
            compute: [null],
          },
        },
      );
      expect(traceTree).to.have.error(1012);
      // await traceTree?.beautyPrint();

        htlcTip3Wallet = locklift.factory.getDeployedContract("TokenWalletUpgradeable", htlcTip3WalletAddress);
        const { value0: htlcTokenBalance } = await htlcTip3Wallet.methods.balance({ answerId: 0 }).call();
        expect(htlcTokenBalance).to.be.equals(
          toNano(0.1).toString(),
          "HTLC wallet amount should be equal to the amount transferred",
        );

      const { traceTree: traceSuccess } = await locklift.tracing.trace(
            htlc.methods.transfer({
            destination: userTip3WalletAddress,
            amount: toNano(0.1),
          })
          .send({
            from: ownerWallet.account.address,
            amount: locklift.utils.toNano(0.1),
          }),
      );
      await traceSuccess?.beautyPrint();
    });

    it("Pushing incoming HTLC in contract to test refund", async function () {
      const now = Math.floor((Date.now())/1000);
      const delta = 11;
      console.log(`Timestamp now ${now} + delta ${(now + delta)}`)
      console.log(`Timestamp getCurrentTime ${locklift.testing.getCurrentTime()}`)
      // increase time by 10 seconds
      await locklift.testing.increaseTime(10);
      // get current offset in seconds
      const currentOffsetInSeconds = locklift.testing.getTimeOffset();
      console.log(`Timestamp getTimeOffset ${currentOffsetInSeconds}`)
      const htlcPayload = (
        await locklift.provider.packIntoCell({
          data: {
            _incoming: true,
            _counterparty: userTip3WalletAddress,
            _hashlock: bufToStr(TEST_PAYMENT_SHA),
            _timelock: now + delta,
          },
          structure: [
            { name: "_incoming", type: "bool" },
            { name: "_counterparty", type: "address" },
            { name: "_hashlock", type: "uint256" },
            { name: "_timelock", type: "uint64" },
          ] as const,
          abiVersion: "2.3",
        })
      ).boc;
      console.log(htlcPayload)
      const { traceTree } = await locklift.tracing.trace(
        ownerTip3Wallet.methods
          .transfer({
            amount: toNano(0.10101),
            recipient: htlc.address,
            deployWalletValue: toNano(0),
            remainingGasTo: ownerWallet.account.address,
            notify: true,
            payload: htlcPayload,
          })
          .send({
            from: ownerWallet.account.address,
            amount: locklift.utils.toNano(1),
          }),
      );
      // await traceTree?.beautyPrint();

      htlcTip3Wallet = locklift.factory.getDeployedContract("TokenWalletUpgradeable", htlcTip3WalletAddress);
      const { value0: htlcTokenBalance } = await htlcTip3Wallet.methods.balance({ answerId: 0 }).call();
      expect(htlcTokenBalance).to.be.equals(
        toNano(0.10101).toString(),
        "HTLC wallet amount should be equal to the amount transferred",
      );
      //console.log(`tokens ${htlcTokenBalance}`);
    });

    it("Check contract LOCK for incoming HTLC", async function () {
      const response = await htlc.methods.getDetails({}).call();
      // Check for corect HTLC contract TIP3 address
      expect(response.tokenWallet.equals(htlcTip3WalletAddress), "Wrong state");
      expect(response.tokenRoot.equals(tokenRootAddress), "Wrong state");
      // Check for hashlock conditions
      expect(response.incoming).to.be.equal(true, "Wrong state");
      expect(response.counterparty.equals(userTip3WalletAddress), "Wrong state");
      //console.log(`${response.counterparty}`);
      expect(response.amount).to.be.equals(
        toNano(0.10101).toString(),
        "HTLC wallet amount should be equal to the amount transferred",
      );
      //TODO: full hash check
      console.log(`Contract timestamp ${Number(response.timelock)}`)
      //expect(Number(response.hashlock)).to.be.not(0, "Wrong state");
      //expect(Number(response.timelock)).to.be.not(0, "Wrong state");
      // this should fail
      const now = Math.floor((Date.now())/1000);
      const htlcPayload = (
        await locklift.provider.packIntoCell({
          data: {
            _incoming: true,
            _counterparty: userTip3WalletAddress,
            _hashlock: bufToStr(TEST_PAYMENT_SHA),
            _timelock: now + 60 * 60,
          },
          structure: [
            { name: "_incoming", type: "bool" },
            { name: "_counterparty", type: "address" },
            { name: "_hashlock", type: "uint256" },
            { name: "_timelock", type: "uint64" },
          ] as const,
          abiVersion: "2.3",
        })
      ).boc;

      const { traceTree } = await locklift.tracing.trace(
        ownerTip3Wallet.methods
          .transfer({
            amount: toNano(0.10101),
            recipient: htlc.address,
            deployWalletValue: toNano(0),
            remainingGasTo: ownerWallet.account.address,
            notify: true,
            payload: htlcPayload,
          })
          .send({
            from: ownerWallet.account.address,
            amount: locklift.utils.toNano(1),
          }),
        {
          raise: false,
          allowedCodes: {
            compute: [null],
          },
        },
      );
      expect(traceTree).to.have.error(1004); // Does not accept new contract setup anymore
      //// await traceTree?.beautyPrint();
      //const tokenBalanceChange = traceTree?.tokens.getTokenBalanceChange(tokenRoot.address);
      //console.log(`token balance change ${tokenBalanceChange}`);
      // -1859458715 measurements depends of token decimals
      const { value0: htlcTokenBalance } = await htlcTip3Wallet.methods.balance({ answerId: 0 }).call();
      console.log(`tokens ${htlcTokenBalance}`);
      //expect(htlcTokenBalance).to.be.equals(
      //toNano(0.10101).toString(),
      //"HTLC wallet amount should be equal to the amount transferred",
      //);
    });
    /*
    it("Request routing from TVM", async function () {
        const ts = Math.trunc(locklift.testing.getCurrentTime()/1000 + 2);
        //console.log(`Timelock: ${ts}`);
        //console.log(`Preimage: ${bufToStr(PAYMENT_PREIMAGE)}, hash ${bufToStr(TEST_PAYMENT_SHA)}`);
              const { traceTree } = await locklift.tracing.trace(htlc.methods.route(
                                                                                         {
                                                                                             counterparty: userTip3WalletAddress,
                                                                                             amount: toNano(1.01),
                                                                                             hashlock: bufToStr(TEST_PAYMENT_SHA),
                                                                                             timelock: Date.now() + 24*60*60*100
                  })
                  .send({
                    from: ownerWallet.account.address,
                    amount: locklift.utils.toNano(0.1),
                  }),
              );

        // await traceTree?.beautyPrint();
        const htlcTip3Wallet = locklift.factory.getDeployedContract('TokenWalletUpgradeable', htlcTip3WalletAddress);
        const {value0: htlcTokenBalance} = await htlcTip3Wallet.methods.balance({ answerId: 0 }).call();
        expect(htlcTokenBalance).to.be.equals(toNano(1.01).toString(), "HTLC wallet amount should be equal to the amount transferred");
    });
    */
    it("Refund", async function () {
      await delay(10000);
      const { traceTree } = await locklift.tracing.trace(
        htlc.methods.refund({}).sendExternal({
          publicKey: owner?.publicKey as string,
        }),
        { raise: true },
      );
      // await traceTree?.beautyPrint();
      const { value0: htlcTokenBalance } = await htlcTip3Wallet.methods.balance({ answerId: 0 }).call();
      expect(htlcTokenBalance).to.be.equals(
        toNano(0.10101).toString(),
        "HTLC wallet amount should be equal to the amount transferred",
      );
    });

    it("Test withdrawals", async function () {
      const { traceTree: traceFail } = await locklift.tracing.trace(
            htlc.methods.transfer({
            destination: userTip3WalletAddress,
            amount: toNano(0.10101),
          })
          .send({
            from: userWallet.account.address,
            amount: locklift.utils.toNano(0.1),
          }),
          { raise: false },
      );
      expect(traceFail).to.have.error(1101);
      await traceFail?.beautyPrint();

      const { traceTree: traceSuccess } = await locklift.tracing.trace(
            htlc.methods.transfer({
            destination: ownerTip3WalletAddress,
            amount: toNano(0.10101),
          })
          .send({
            from: ownerWallet.account.address,
            amount: locklift.utils.toNano(0.1),
          }),
      );
      await traceSuccess?.beautyPrint();

      const { value0: htlcTokenBalance } = await htlcTip3Wallet.methods.balance({ answerId: 0 }).call();
      expect(htlcTokenBalance).to.be.equals(
        toNano(0).toString(),
        "HTLC wallet amount should be equal to the amount transferred",
      );
    });

    it("Pushing incoming HTLC in contract to test settlement", async function () {
      const now = Math.floor((Date.now())/1000);
      const htlcPayload = (
        await locklift.provider.packIntoCell({
          data: {
            _incoming: true,
            _counterparty: userTip3WalletAddress,
            _hashlock: bufToStr(TEST_PAYMENT_SHA),
            _timelock: now + 60 * 60,
          },
          structure: [
            { name: "_incoming", type: "bool" },
            { name: "_counterparty", type: "address" },
            { name: "_hashlock", type: "uint256" },
            { name: "_timelock", type: "uint64" },
          ] as const,
          abiVersion: "2.3",
        })
      ).boc;

      const { traceTree } = await locklift.tracing.trace(
        ownerTip3Wallet.methods
          .transfer({
            amount: toNano(0.10101),
            recipient: htlc.address,
            deployWalletValue: 0,
            remainingGasTo: ownerWallet.account.address,
            notify: true,
            payload: htlcPayload,
          })
          .send({
            from: ownerWallet.account.address,
            amount: locklift.utils.toNano(1),
          }),
      );
      // await traceTree?.beautyPrint();

      const htlcTip3Wallet = locklift.factory.getDeployedContract("TokenWalletUpgradeable", htlcTip3WalletAddress);
      const { value0: htlcTokenBalance } = await htlcTip3Wallet.methods.balance({ answerId: 0 }).call();
      expect(htlcTokenBalance).to.be.equals(
        toNano(0.10101).toString(),
        "HTLC wallet amount should be equal to the amount transferred",
      );
    });

    it("Try wrong preimage", async function () {
      const { traceTree } = await locklift.tracing.trace(
        htlc.methods
          .settle({
            preimage: "0x0",
          })
          .send({
            from: userWallet.account.address,
            amount: locklift.utils.toNano(0.1),
          }),
          { raise: false },
      );
      // await traceTree?.beautyPrint();
      expect(traceTree).to.have.error(1003); // Does not accept new contract setup anymore
      const { value0: htlcTokenBalance } = await htlcTip3Wallet.methods.balance({ answerId: 0 }).call();
      expect(htlcTokenBalance).to.be.equals(
        toNano(0.10101).toString(),
        "HTLC wallet amount should be equal to the amount transferred",
      );
    });

    it("Settlement of incoming HTLC", async function () {
      const { traceTree } = await locklift.tracing.trace(
        htlc.methods
          .settle({
            preimage: bufToStr(PAYMENT_PREIMAGE),
          })
          .send({
            from: userWallet.account.address,
            amount: locklift.utils.toNano(0.1),
          }),
          { raise: true },
      );
      // await traceTree?.beautyPrint();
      const { value0: htlcTokenBalance } = await htlcTip3Wallet.methods.balance({ answerId: 0 }).call();
      expect(htlcTokenBalance).to.be.equals(
        toNano(0.10101).toString(),
        "HTLC wallet amount should be equal to the amount transferred",
      );
    });

    it("Request for outgoing transfer", async function () {
      const now = Math.floor((Date.now())/1000);
      const { traceTree } = await locklift.tracing.trace(
        htlc.methods
          .route({
            counterparty: userTip3WalletAddress,
            amount: toNano(0.10101), // we have to request more
            hashlock: bufToStr(TEST_PAYMENT_SHA),
            timelock: now + 60,//24 * 60 * 60 * 100,
          })
          .send({
            from: ownerWallet.account.address,
            amount: locklift.utils.toNano(0.1),
          }),
          { raise: true },
      );
      // await traceTree?.beautyPrint();
    });

    it("Check contract LOCK for outgoing HTLC", async function () {
      const response = await htlc.methods.getDetails({}).call();
      // Check for corect HTLC contract TIP3 address
      expect(response.tokenWallet.equals(htlcTip3WalletAddress), "Wrong state");
      expect(response.tokenRoot.equals(tokenRootAddress), "Wrong state");
      expect(response.incoming).to.be.equal(false, "Wrong state");
      expect(response.counterparty.equals(userTip3WalletAddress), "Wrong state");
      expect(response.amount).to.be.equals(
        toNano(0.10101).toString(),
        "HTLC wallet amount should be equal to the amount transferred",
      );
      const now = Math.floor((Date.now())/1000);
      const { traceTree } = await locklift.tracing.trace(
        htlc.methods
          .route({
            counterparty: userTip3WalletAddress,
            amount: toNano(0.101),
            hashlock: bufToStr(TEST_PAYMENT_SHA),
            timelock: now + 4, // 24 * 60 * 60 * 100,
          })
          .send({
            from: ownerWallet.account.address,
            amount: locklift.utils.toNano(0.1),
          }),
          { raise: false },
      );
      expect(traceTree).to.have.error(1004); // Does not accept new contract setup anymore
    });

    it("Settlement of outgoing HTLC", async function () {
      const { traceTree } = await locklift.tracing.trace(
        htlc.methods
          .settle({
            preimage: bufToStr(PAYMENT_PREIMAGE),
          })
          .send({
            from: ownerWallet.account.address,
            amount: locklift.utils.toNano(0.1),
          }),
          { raise: true },
      );
      await traceTree?.beautyPrint();
      const { value0: htlcTokenBalance } = await htlcTip3Wallet.methods.balance({ answerId: 0 }).call();
      expect(htlcTokenBalance).to.be.equals(
        toNano(0).toString(),
        "HTLC wallet amount should be equal to the amount transferred",
      );
    });

  });
});
