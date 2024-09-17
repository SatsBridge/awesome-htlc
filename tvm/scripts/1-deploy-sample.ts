import { Address, Contract, getRandomNonce, Signer, toNano, WalletTypes } from "locklift";

let ownerWallet: { signer: Signer; account: Account };

async function main() {
  const signer = (await locklift.keystore.getSigner("0"))!;
  const accountAddress = process.env.ACCOUNT;
  ownerWallet = {
    signer: signer,
    account: accountAddress
      ? await locklift.factory.accounts.addExistingAccount({
          type: WalletTypes.EverWallet,
          address: new Address(accountAddress),
        })
      : await locklift.factory.accounts
          .addNewAccount({
            type: WalletTypes.EverWallet,
            value: toNano(10),
            publicKey: signer.publicKey,
          })
          .then(res => res.account),
  };
  //const tokenRootAddress = new Address("0:044d80aedba620d3b99231a2dac82f077e8672899221dff04bf83b173227d14a");
  const tokenRootAddress = new Address("0:34eefc8c8fb2b1e8da6fd6c86c1d5bcee1893bb81d34b3a085e301f2fba8d59c");
  const { contract: htlc, tx } = await locklift.factory.deployContract({
    contract: "HTLCForwarder",
    publicKey: signer.publicKey,
    initParams: {
      _randomNonce: locklift.utils.getRandomNonce(),
      tokenRoot_: tokenRootAddress,
    },
    constructorParams: {
       _owner: ownerWallet.account.address,
    },
    value: locklift.utils.toNano(3),
  });

  console.log(`HTLCForwarder deployed at: ${htlc.address.toString()}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
