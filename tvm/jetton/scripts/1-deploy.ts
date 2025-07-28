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
  /*
  {
    "address": "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe",
    "name": "Tether USD",
    "symbol": "USD₮",
    "decimals": "6",
    "image": "https://tether.to/images/logoCircle.png",
    "description": "Tether Token for Tether USD"
  }
  */
  const tokenRootAddress = new Address("0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe");
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
    value: locklift.utils.toNano(0.1),
  });

  console.log(`HTLCForwarder deployed at: ${htlc.address.toString()}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
