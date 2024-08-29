# Threaded Virtual Machine Solidity HTLC

"HTLCForwarder" contract is a robust implementation designed for the TVM (Threaded Virtual Machine) that utilizes the 
unique features of 'asyncronous' blockchain architecture to manage Hashed Time Lock Contracts (HTLCs) for 
[TIP3](https://github.com/broxus/tip3) token transfers.

### Supported Networks:

* Everscale and Venom
* The Open Network (expected to be compatible as for Aug 2024)

### Contract Workflow:

The forwarder handles only one transaction at a time, this contract can reset its state after each operation, 
allowing for consecutive transactions without the need to deploy a new contract each time.

Major steps include:

1. **Initialization**: Setup is done via the constructor where the initial state is configured, and token wallet 
deployment is initiated if necessary.
2. **Routing HTLCs**: The `route` function sets up the HTLC, specifying details such as the counterparty, amount,
hashlock, and timelock. It caters exclusively to outgoing transfers, capturing funds and preparing them for conditional 
release.
3. **Settlement**: Upon presenting the correct preimage that satisfies the hashlock, the `settle` function releases the 
funds to the appropriate party—either retaining them within the contract for incoming transfers or sending them out for 
outgoing transfers.
4. **Refunding**: If the timelock expires without the condition being met, the `refund` function returns the funds to 
the initiator, ensuring that tokens are not permanently locked.
5. **State Resetting**: After each transaction, `resetContractState` is called to clear the current operational 
parameters, making the contract ready for the next transaction.

### TIP3 Contract Callback

The `onAcceptTokensTransfer` function serves as a callback mechanism in TVM's blockchain ecosystems, specifically 
designed to interact with TIP3 token contracts. It is invoked by a TIP3 token contract after a token transfer has been a
pproved and executed, facilitating post-transfer operations within the contract that defines this callback. 

Here's a detailed explanation of how this function operates and its role within the broader contract architecture:

The function updates internal states setting a contract into 'routing' mode. This function is not called directly by 
users or other contracts in a straightforward manner. Instead, it is automatically invoked by a TIP3 token contract once
a transfer of tokens to the callback-implementing contract is completed successfully.

The `onAcceptTokensTransfer` receives several parameters that provide context about the transfer, including:

 - `tokenRoot`: The address of the token root contract, identifying the specific type of token involved in the transfer.
 - `amount`: The amount of tokens transferred.
 - `sender`: The address from which the tokens were sent.
 - `senderWallet`: The specific wallet address that initiated the token transfer.
 - `remainingGasTo`: The address intended to receive any remaining gas left over from the transaction.
 - `payload`: A TvmCell containing additional data or instructions that may affect the logic executed by the callback.

In the provided HTLCForwarder contract for the TON blockchain, the `onAcceptTokensTransfer` function uses a specific modifier named `onlyOurWallet` to enforce certain security and logical constraints. Here’s an analysis of this modifier and its implications:

The Modifier `onlyOurWallet` ensures that the `onAcceptTokensTransfer` callback function is only executed under secure 
and expected conditions. Here's how it works:

```solidity
modifier onlyOurWallet() {
    require(tokenWallet_.value != 0 && msg.sender == tokenWallet_, HTLCErrors.INVALID_TOKEN_WALLET);
    _;
}
```

This is critical for maintaining control over who can trigger the callback and under what circumstances it can be 
invoked. It checks:

 1. **Non-zero Wallet Address**: It first checks if `tokenWallet_` is not zero, which ensures that the wallet address is
 set before the function proceeds. This prevents the function from being called before the contract is fully initialized
 or in a reset state.
 2. **Correct Caller**: It verifies that `msg.sender` is equal to `tokenWallet_`, meaning the function call must come 
 from the contract’s designated token wallet. This is a security measure to prevent unauthorized calls from other 
 addresses that might attempt to manipulate the contract’s state or trigger functions maliciously.

If either of the conditions fails, it throws an error with the message `HTLCErrors.INVALID_TOKEN_WALLET`, which helps 
in debugging and understanding why a function call was rejected.

To set the Forwarder into 'routing' state, the contract verifies incoming payload: 

1. The function first checks if the length of the incoming payload (`payloadSlice.bits()`) is exactly 588 bits. This 
specific check ensures that the payload format matches expected parameters and aligns with predefined data structures.
2. After confirming the payload length, the function decodes the payload to extract a boolean (`incoming`) and an 
address (`counterparty`). The contract then checks if `hashlock_` is `0x0`, which indicates that no current HTLC is 
active, and the contract is ready to accept a new HTLC setup:
 - If the contract is ready, it proceeds to decode additional parameters from the payload (`hashlock` and `timelock`) 
  and sets these along with the amount and counterparty to establish a new HTLC.
 - It also ensures that the `timelock` is set for a future time (`timelock > now`), adding a temporal constraint to the 
 HTLC.

If the contract is currently in a locked state (`hashlock_` is not `0x0`), indicating that another HTLC is active, the 
function does not allow new setups or modifications. Instead, it attempts to refund the incoming tokens back to the 
sender to prevent unintentional locking of funds under incorrect conditions. An error (`HTLCErrors.IN_SETTLEMENT_PHASE`)
is thrown to indicate that the contract is already engaged in another transaction.
