# HTLC Forwarder

[![NPM Package](https://img.shields.io/npm/v/ethereum-htlc.svg?style=flat-square)](https://www.npmjs.org/package/ethereum-htlc)
[![Build Status](https://travis-ci.org/chatch/hashed-timelock-contract-ethereum.svg?branch=master)](https://travis-ci.org/chatch/hashed-timelock-contract-ethereum)

[Hashed Timelock Contracts](https://en.bitcoin.it/wiki/Hashed_Timelock_Contracts) (HTLCs) for Ethereum:

- [HashedTimelock.sol](evm/contracts/HashedTimelock.sol) - HTLC for native ETH token
- [ForwarderHashedTimelockERC20.sol](evm/contracts/ForwarderHashedTimelockERC20.sol) - HTLC for ERC20 tokens
- [HashedTimelockERC721.sol](evm/contracts/HashedTimelockERC721.sol) - HTLC for ERC721 tokens

Use these contracts for creating HTLCs on the Ethereum side of a cross chain atomic swap (for example the [xcat](https://github.com/chatch/xcat) project).

## Deploying a contract

In local hardhat setup (inside the container) it is possible to use this command to test deployment:

```shell
npx hardhat node & npx hardhat run --network localhost scripts/deploy.js
```

## Run Tests

- This fork is updated to work [with Hardhat](https://hardhat.org/)

```shell
npx hardhat test
```

Expected result

```
    ✔ Should fail if non-owner tries to transfer tokens
    ✔ Should allow owner to transfer tokens
    ✔ Create newIncomingHtlc()
    ✔ Settle Incoming Htlc
    ✔ Create newOutgoingHtlc()
    ✔ Settle Outgoing Htlc
    ✔ Past timelock
    ✔ Should fail if ERC20 token wasn't provided in constructor
    ✔ Null counterparty address
    ✔ The amount below minimum
    ✔ Insufficient balance
    ✔ Cannot refund if not in settlement state
    ✔ Wrong preimage on newIncomingHtlc()
    ✔ Wrong preimage on newOutgoingHtlc() 
    ✔ Should prevent owner from transferring tokens if contract is in settlement
    ✔ Test settlement lock 
    ✔ Test refunds Incoming
    ✔ Test refunds Outgoing


  19 passing (1s)
```