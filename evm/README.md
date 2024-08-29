# Ethereum Virtual Machine Solidity HTLC

## Swap Contract

The repository includes [a fork](https://github.com/SatsBridge/hashed-timelock-contract-ethereum) of the 
[original set of HTLC contracts](https://github.com/brave-experiments/hashed-timelock-contract-ethereum.git). They 
implement Hashed Timelock Contracts (HTLCs) for native ETH, ERC20 and ERC721 tokens, which is a type of smart contract 
used to secure transactions by requiring that a cryptographic proof (hashlock) is provided within a certain time frame 
(timelock).

The fork is build for Solidity `^0.7.6` instead of `^0.5.0` in the original code. These version differences mean there 
are changes in syntax (like the replacement of `now` with `block.timestamp`).

The most important change related to different **Identifier for Contracts**. New Contract uses `hashlock` as the 
identifier for contracts while the old Contract relies on a generated `contractId` based on hash values of several 
parameters (sender, receiver, token contract, amount, hashlock, timelock).

When `hashlock` is used directly as the identifier in a mapping of contracts, it means that the contract is uniquely 
associated with the hash of a preimage. If the `hashlock` is reused (i.e., the same preimage is used to generate the 
hashlock in multiple contracts), it might compromise the security of new routing attempts in Lightning network using the 
same `hashlock` since the preimage is already known. Besides, avoiding `contractId` allows for reducing gas and storage
costs.

The core logic of both versions remains similar, but the naming and handling of certain internal checks, such as 
checking for contract existence or hashlock matching, differ slightly in terms of parameters and the IDs used.

## Forwarding Contract

Another type of HTLC presenting in this repository is `ForwarderHashedTimelockERC20`. It is an Ethereum smart contract 
utilizing Solidity ^0.8.24. It employs the OpenZeppelin libraries to manage ERC20 tokens and to prevent reentrancy 
attacks. This contract sets up Hashed Timelock Contracts (HTLCs), which facilitate conditional token transfers based on 
time and cryptographic proof.

Unlike the 'Swap' contract that manage multiple HTLCs independently, this contract is designed to handle one HTLC at a 
time and can reset its state to manage another transaction after one is completed. `ForwarderHashedTimelockERC20` also
uses OpenZeppelin’s `Ownable` for access control, allowing specific administrative actions like token transfers under 
the owner's command.

The contract explicitly handles the state by resetting after operations, differentiating it from others that may leave 
the contract in a final state or require manual intervention for state management. `ForwarderHashedTimelockERC20` 
is more compact, versatile, and secure.