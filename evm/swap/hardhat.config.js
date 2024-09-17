//require('@nomiclabs/hardhat-truffle5');
//require('@nomicfoundation/hardhat-chai-matchers');
require("dotenv").config();

const {
MNEMONIC,
INFURA_API_KEY,
LINEASCAN_API_KEY,
ALCHEMY_API_KEY
} = process.env;

module.exports = {
  defaultNetwork: "localhost",
  networks: {
    localhost: {
      url: "http://0.0.0.0:8545"
    },
    hardhat: {
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
    linea_mainnet: {
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
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 40000
  }
}