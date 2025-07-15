const { ethers } = require("hardhat");

// 'linea-sepolia'
//const erc20 = '0xae3A9f403c55CCaf9FF2b918d213C34537185620'
// 'sepolia'
//const erc20 = '0x7F3B9A9387521227F968E337BBA7a053992A09CC'
// 'arbitrum-sepolia'
const erc20 = '0x55ad7E8d19b4A19Fa8217a799A4Be63C82dA0a89'
// 'arbitrum'
//const erc20 = '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40'

async function deploy(deployer) {
    const Htlc = await ethers.getContractFactory("ForwarderHashedTimelockERC20");
    const htlc = await Htlc.connect(deployer).deploy(deployer.address, erc20);
    await htlc.waitForDeployment(); // Ethers v6 equivalent to deployed()
    return htlc;
}

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);
    const balance = await ethers.provider.getBalance(deployer.address);
    //console.log("Account balance:", ethers.utils.formatEther(balance));
    const htlc = await deploy(deployer);
    console.log(`HashedTimelockERC20 deployed to ${htlc.target}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });