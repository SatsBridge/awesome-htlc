Welcome to the "Awesome HTLC" repository on GitHub! This repository is dedicated to curating Hashed Time Lock Contract 
(HTLC) implementations across a variety of blockchain platforms. Whether you are a developer, researcher, or enthusiast 
interested in atomic swaps, conditional transactions, or decentralized finance (DeFi), this repository serves as a 
comprehensive resource for exploring and understanding HTLCs.

### What is HTLC?

A [Hashed Time Lock Contract (HTLC)](https://en.bitcoin.it/wiki/Hash_Time_Locked_Contracts) is a type of smart contract 
used in blockchain applications to enable secure, trustless transactions conditioned on time and cryptographic proof. 
HTLCs are fundamental to implementing atomic swaps between different cryptocurrencies or blockchain networks without the
need for third-party intermediaries.

### Available Implementations

* Ethereum Virtual Machine Solidity contracts:
  * ['Swap'](./evm/swap/README.md) type that carries out internal state with all ongoing and conducted swaps,
  * ['Forwarder'](./evm/forwarder/README.md) type of contract that allows executing only one HTLC at a time with fixed internal state and therefore, 
  gas costs.
* [Threaded Virtual Machine Solidity contracts](./tvm/README.md):
  * Everscale/Venom implementations for TIP3 token standard.

### Reading Materials