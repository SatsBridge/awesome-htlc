const { ethers } = require("hardhat");

async function deploy(deployer) {
  const Htlc = await ethers.getContractFactory(
    "ForwarderHashedTimelockERC20",
    deployer,
  );
  const htlc = await Htlc.deploy();

  return [htlc];
}

async function main() {
  const [deployer] = await ethers.getSigners();

  //console.log("Deploying contracts with the account: ", await deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  //console.log("Account balance: ", await ethers.utils.formatEther(balance), "ETH");

  let [htlc] = await deploy(deployer);
  await htlc.deployed;

  //console.log("HashedTimelockERC20 deployed to ", await htlc.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
