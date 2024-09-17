import { lockliftChai, LockliftConfig } from "locklift";
import { FactorySource } from "./build/factorySource";
import * as dotenv from "dotenv";
import chai from "chai";

dotenv.config();
const {
LOCAL_NETWORK_ENDPOINT,
LOCAL_GIVER_ADDRESS,
LOCAL_GIVER_KEY,
LOCAL_PHRASE,
VENOM_TESTNET_RPC_NETWORK_ENDPOINT,
VENOM_TESTNET_GQL_NETWORK_ENDPOINT,
VENOM_TESTNET_GIVER_ADDRESS,
VENOM_TESTNET_GIVER_PHRASE,
VENOM_TESTNET_PHRASE,
MAINNET_NETWORK_ENDPOINT,
MAINNET_GIVER_ADDRESS,
MAINNET_GIVER_PHRASE,
MAINNET_PHRASE
} = process.env;

chai.use(lockliftChai);

declare global {
  const locklift: import("locklift").Locklift<FactorySource>;
}

// Create your own link on https://dashboard.evercloud.dev/

const config: LockliftConfig = {
  compiler: {
    version: "0.62.0",

    // Specify config for extarnal contracts as in exapmple
    externalContracts: {
      "node_modules/@broxus/tip3/contracts": [
        "Account",
        "TokenRoot",
        "TokenWallet",
        "TokenRootUpgradeable",
        "TokenWalletUpgradeable",
        "TokenWalletPlatform",
      ],
    },
  },
  linker: {
    version: "0.15.48",
  },
  networks: {
    locklift: {
      connection: {
        id: 1001,
        // @ts-ignore
        type: "proxy",
        // @ts-ignore
        data: {},
      },
      keys: {
        // Use everdev to generate your phrase
        // !!! Never commit it in your repos !!!
        // phrase: "action inject penalty envelope rabbit element slim tornado dinner pizza off blood",
        amount: 20,
      },
    },
    local: {
      // Specify connection settings for https://github.com/broxus/everscale-standalone-client/
      connection: {
        id: 1,
        group: "localnet",
        type: "graphql",
        data: {
          endpoints: [LOCAL_NETWORK_ENDPOINT],
          latencyDetectionInterval: 1000,
          local: true,
        },
      },
      giver: {
        address: LOCAL_GIVER_ADDRESS,
        key: LOCAL_GIVER_KEY,
      },
      keys: {
        phrase: LOCAL_PHRASE,
        amount: 20,
      },
    },
    venom_testnet: {
      connection: {
        id: 1000,
        type: "jrpc",
        group: "dev",
        data: {
          endpoint: VENOM_TESTNET_RPC_NETWORK_ENDPOINT,
        },
      },
      giver: {
        address: VENOM_TESTNET_GIVER_ADDRESS,
        phrase: VENOM_TESTNET_GIVER_PHRASE,
        accountId: 0,
      },
      keys: {
        // Use everdev to generate your phrase
        // !!! Never commit it in your repos !!!
        phrase: VENOM_TESTNET_PHRASE,
        amount: 20,
      },
    },
    main: {
      // Specify connection settings for https://github.com/broxus/everscale-standalone-client/
      connection: "mainnetJrpc",
      // This giver is default Wallet
      giver: {
        address: MAINNET_GIVER_ADDRESS,
        phrase: MAINNET_GIVER_PHRASE,
        accountId: 0,
      },
      keys: {
        // Use everdev to generate your phrase
        // !!! Never commit it in your repos !!!
        phrase: MAINNET_PHRASE,
        amount: 20,
      },
    },
  },
  mocha: {
    timeout: 2000000,
  },
};

export default config;
