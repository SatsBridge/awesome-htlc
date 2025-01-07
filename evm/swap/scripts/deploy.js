const { ethers } = require("hardhat");

async function deploy(deployer) {
    const Htlc = await ethers.getContractFactory("HashedTimelockERC20");
    const htlc = await Htlc.connect(deployer).deploy();
    await htlc.waitForDeployment(); // Ethers v6 equivalent to deployed()
    return htlc;
}

async function main() {
  const [deployer] = await ethers.getSigners();

  // Uncomment if needed
  console.log("Deploying contracts with the account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", balance);
  //console.log("Account balance:", ethers.utils.formatEther(balance), "ETH");

  // Deploy the contract
  const htlc = await deploy(deployer);

  // Log the deployed contract address
  console.log(`HashedTimelockERC20 deployed to ${htlc.target}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
