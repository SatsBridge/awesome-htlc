import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition-ethers";
require("dotenv").config();

const {
MNEMONIC,
INFURA_API_KEY,
LINEASCAN_API_KEY,
ALCHEMY_API_KEY
} = process.env;

const config: HardhatUserConfig = {
  solidity: "0.8.27",
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    linea_testnet: {
      url: `https://linea-sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts: {
        mnemonic: MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
        passphrase: "",
      },
    },
    arbitrum_testnet: {
      url: `https://arbitrum-sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts: {
        mnemonic: MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
        passphrase: "",
      },
    },
    arbitrum: {
      url: `https://arbitrum-mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: {
        mnemonic: MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
        passphrase: "",
      },
    },
    linea: {
      url: `https://linea-mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: {
        mnemonic: MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
        passphrase: "",
      },
    },
    sepolia: {
          url: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
          accounts: {
            mnemonic: MNEMONIC,
            path: "m/44'/60'/0'/0",
            initialIndex: 0,
            count: 20,
            passphrase: "",
          },
        },
    },
};

export default config;
