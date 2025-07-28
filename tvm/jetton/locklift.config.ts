import { lockliftChai, LockliftConfig } from "locklift";
import { FactorySource } from "./build/factorySource";
import * as dotenv from "dotenv";
import chai from "chai";

//import "locklift-verifier";

dotenv.config();
const {
  LOCAL_NETWORK_ENDPOINT,
  LOCAL_GIVER_ADDRESS,
  LOCAL_GIVER_KEY,
  LOCAL_PHRASE,
  TON_NETWORK_ENDPOINT,
  TON_GIVER_ADDRESS,
  TON_GIVER_PHRASE,
  TON_PHRASE,
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
  verifier: {
    verifierVersion: "latest", // contract verifier binary, see https://github.com/broxus/everscan-verify/releases
    apiKey: "uwJlTyvauW",
    secretKey: "IEx2jg4hqE3V1YUqcVOY",
    // license: "AGPL-3.0-or-later", <- this is default value and can be overrided
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
    ton: {
      blockchainConfig: "TON",
      connection: {
        id: 1000,
        type: "jrpc",
        group: "mainnet",
        data: {
          endpoint: TON_NETWORK_ENDPOINT,
        },
      },
      // This giver is default Wallet
      giver: {
        address: TON_GIVER_ADDRESS,
        phrase: TON_GIVER_PHRASE,
        accountId: 0,
      },
      keys: {
        phrase: TON_PHRASE,
      },
    },
    preset: {
      blockchainConfig: "TON", // or other presets, or we can provide our custom config by {cunstom: "MY BLOCKCHAIN CONFIG"}
      connection: {
        id: 1001,
        // @ts-ignore
        type: "proxy",
        // @ts-ignore
        data: {},
      },
      keys: {
        phrase: TON_PHRASE,
      },
    },
  },
  mocha: {
    timeout: 2000000,
  },
};

export default config;
