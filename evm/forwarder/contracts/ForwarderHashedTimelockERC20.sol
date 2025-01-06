// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Forwarder Hashed Timelock Contract for ERC20 Tokens
/// @notice Implements a hashed timelock contract (HTLC) for secure cross-chain/offchain token transfers
/// @dev This contract enables "submarine" swaps of ERC20 tokens using hashlock and timelock mechanisms
contract ForwarderHashedTimelockERC20 is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /// @notice Direction of token transfer (true for incoming, false for outgoing)
    bool public incoming;

    /// @notice Address of the counterparty involved in the transfer
    address public counterparty;

    /// @notice Address of the ERC20 token contract being used
    /// @dev To avoid DOS type of attacks with created ERC20 token the forwarder locks to certain ERC20 address
    address public tokenContract;

    /// @notice Amount of tokens being transferred in swap
    uint256 public amount;

    /// @notice Hash of the secret preimage used for the hashlock in swap
    bytes32 public hashlock;

    /// @notice Timestamp after which the transfer can be refunded
    uint256 public timelock;

    /// @notice Emitted when a new HTLC transfer is initiated
    /// @param incoming Direction of the transfer
    /// @param counterparty Address of the counterparty
    /// @param tokenContract Address of the ERC20 token
    /// @param amount Number of tokens being transferred
    /// @param hashlock Hash of the secret preimage
    /// @param timelock Expiration timestamp
    event HTLCERC20New(
        bool incoming,
        address indexed counterparty,
        address indexed tokenContract,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    );

    /// @notice Emitted when an HTLC transfer is settled with the correct preimage
    /// @param preimage The secret preimage that matches the hashlock
    /// @param tokenContract Address of the ERC20 token
    /// @param amount Number of tokens transferred
    event HTLCERC20Settle(bytes32 indexed preimage, address tokenContract, uint256 amount);

    /// @notice Emitted when an HTLC transfer is refunded after timelock expiration
    /// @param hashlock Hash of the secret preimage
    /// @param tokenContract Address of the ERC20 token
    /// @param amount Number of tokens refunded
    event HTLCERC20Refund(bytes32 indexed hashlock, address tokenContract, uint256 amount);

    /// @notice Emitted when the contract state is reset
    event HTLCReset();

    /// @notice Emitted when the token contract address is changed by the owner
    /// @param oldTokenContract Previous token contract address
    /// @param newTokenContract New token contract address
    event TokenContractChanged(address indexed oldTokenContract, address indexed newTokenContract);

    /// @notice Initialize the contract with an owner and token contract address
    /// @param _initialOwner Address of the contract owner
    /// @param _tokenContract Address of the ERC20 token contract
    constructor(address _initialOwner, address _tokenContract) Ownable(_initialOwner) {
        tokenContract = _tokenContract;
        resetContractState();
    }

    /// @notice Ensures the timelock has expired
    modifier pastTimelock() {
        require(timelock <= block.timestamp, "Timelock not yet passed");
        _;
    }

    /// @notice Validates that a given preimage matches the hashlock
    /// @param _hashlock The stored hashlock
    /// @param _x The preimage to validate
    modifier hashlockMatches(bytes32 _hashlock, bytes32 _x) {
        require(_hashlock == sha256(abi.encodePacked(_x)), "Hashlock hash does not match");
        _;
    }

    /// @notice Ensures the contract is not in a settlement state
    modifier transferable() {
        require(counterparty == address(0), "Contract is in settlement state");
        _;
    }

    /// @notice Ensures the contract is in a settlement state
    modifier locked() {
        require(counterparty != address(0), "Not in settlement state");
        _;
    }

    /// @notice Initiates a new HTLC transfer
    /// @dev Sets up a new transfer with hashlock and timelock conditions
    /// @dev Excess allowances for ERC20 transfer should not be granted otherwise funds may be drained by an attacker
    /// @param _counterparty Address of the counterparty
    /// @param _incoming Direction of transfer
    /// @param _hashlock Hash of the secret preimage
    /// @param _timelock Expiration timestamp
    /// @param _tokenContract Address of the ERC20 token
    /// @param _amount Number of tokens to transfer
    /// @return bool Indicating success of the operation
    function route(
        address _counterparty,
        bool _incoming,
        bytes32 _hashlock,
        uint256 _timelock,
        address _tokenContract,
        uint256 _amount
    ) external transferable returns (bool) {
        require(_tokenContract == tokenContract, "Token is not allowed");
        require(_counterparty != address(0), "Counterparty can't be zero address");
        require(_amount > 0, "Token amount must be > 0");
        require(_hashlock != bytes32(0),  "Hashlock can't be zero");
        require(_timelock > block.timestamp, "Timelock time must be in the future");
        require(_timelock < block.timestamp + 1209600, "Timelock time must be not too far in the future");

        if (_incoming) {
            // leaving redundant check for better safety
            require(IERC20(_tokenContract).allowance(_counterparty, address(this)) == _amount, "Token allowance must be equal to amount");
            IERC20(_tokenContract).transferFrom(_counterparty, address(this), _amount);
        } else {
            require(msg.sender == owner(), "Only owner can set outgoing transfers");
        }

        incoming = _incoming;
        counterparty = _counterparty;
        amount = _amount;
        timelock = _timelock;
        hashlock = _hashlock;

        emit HTLCERC20New(_incoming, _counterparty, _tokenContract, _amount, _hashlock, _timelock);

        return true;
    }

    /// @notice Settles the HTLC transfer using the correct preimage
    /// @dev Validates the preimage and executes the transfer
    /// @param _preimage The secret preimage that matches the hashlock
    /// @return bool Indicating success of the settlement
    function settle(bytes32 _preimage) external nonReentrant hashlockMatches(hashlock, _preimage) returns (bool) {
        if (!incoming) {
            IERC20(tokenContract).transfer(counterparty, amount);
        }
        emit HTLCERC20Settle(_preimage, tokenContract, amount);
        resetContractState();
        return true;
    }

    /// @notice Refunds the transfer after timelock expiration
    /// @dev Can only be called after timelock has expired
    /// @return bool Indicating success of the refund
    function refund() external nonReentrant locked pastTimelock returns (bool) {
        if (incoming) IERC20(tokenContract).transfer(counterparty, amount);
        emit HTLCERC20Refund(hashlock, tokenContract, amount);
        resetContractState();
        return true;
    }

    /// @notice Allows the owner to change the token contract address
    /// @dev Can only be called by owner and when not in settlement state
    /// @param _newTokenContract Address of the new ERC20 token contract
    /// @return bool Indicating success of the operation
    function setTokenContract(address _newTokenContract) external onlyOwner transferable returns (bool) {
        require(_newTokenContract != address(0), "Token contract can't be zero address");
        require(_newTokenContract != tokenContract, "New token address must be different");

        address oldTokenContract = tokenContract;
        tokenContract = _newTokenContract;

        emit TokenContractChanged(oldTokenContract, _newTokenContract);
        return true;
    }

    /// @notice Allows owner to transfer tokens directly
    /// @dev Can only be used when contract is not in settlement state
    /// @param _tokenContract Address of the ERC20 token
    /// @param _counterparty Recipient address
    /// @param _amount Number of tokens to transfer
    /// @return bool Indicating success of the transfer
    function transfer(address _tokenContract, address _counterparty, uint256 _amount) external onlyOwner transferable returns (bool) {
        IERC20(_tokenContract).transfer(_counterparty, _amount);
        return true;
    }

    /// @notice Resets the contract state variables
    /// @dev Internal function called after settlement or refund
    function resetContractState() internal {
        counterparty = address(0);
        amount = 0;
        timelock = 0;
        hashlock = 0x0;
        emit HTLCReset();
    }

    /// @notice Retrieves the current state of the contract
    /// @dev Returns all relevant contract parameters
    /// @return _incoming Direction of transfer
    /// @return _counterparty Address of counterparty
    /// @return _tokenContract Address of ERC20 token
    /// @return _amount Number of tokens
    /// @return _hashlock Hash of secret preimage
    /// @return _timelock Expiration timestamp
    function getDetails()
    external
    view
    returns (
        bool _incoming,
        address _counterparty,
        address _tokenContract,
        uint256 _amount,
        bytes32 _hashlock,
        uint256 _timelock
    ) {
        return (incoming, counterparty, tokenContract, amount, hashlock, timelock);
    }
}