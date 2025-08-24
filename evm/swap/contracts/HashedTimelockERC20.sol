/* SPDX-License-Identifier: MIT */
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Hashed Timelock Contracts (HTLCs) for ERC20 Tokens
 * @notice Implements secure atomic swaps for ERC20 tokens using hashlock and timelock mechanisms
 * @dev This contract enables trustless peer-to-peer token exchanges and cross-chain atomic swaps.
 *      Key security features:
 *      - Reentrancy protection on all state-changing functions
 *      - Safe ERC20 integration handles non-standard tokens (USDT, etc.)
 *      - Fee-on-transfer token support through balance differential checking
 *      - Secret size attack prevention with 32-byte preimage validation
 *      - Proper authorization controls for withdraw and refund operations
 *      - Timelock bounds prevent griefing and ensure reasonable swap windows
 *
 * @author Your Team Name
 * @custom:version 1.0.0
 * @custom:security-contact security@yourproject.com
 *
 * Protocol Flow:
 * 1. Sender creates HTLC with newContract(receiver, hashlock, timelock, token, amount)
 * 2. Receiver reveals secret with withdraw(hashlock, preimage) to claim tokens
 * 3. Sender can reclaim tokens with refund(hashlock) after timelock expires
 */
contract HashedTimelockERC20 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    //////////////////////////////////////////////////////////////
    //                        CONSTANTS                         //
    //////////////////////////////////////////////////////////////

    /// @notice Maximum timelock duration in blocks (~3.3 hours on Ethereum)
    /// @dev Prevents contracts from being locked for unreasonably long periods
    uint256 public constant MAX_TIMELOCK_BLOCKS = 1000;

    /// @notice Minimum timelock duration in blocks (~20 minutes on Ethereum)
    /// @dev Ensures sufficient time for cross-chain operations and prevents front-running
    uint256 public constant MIN_TIMELOCK_BLOCKS = 100;

    //////////////////////////////////////////////////////////////
    //                         EVENTS                           //
    //////////////////////////////////////////////////////////////

    /**
     * @notice Emitted when a new HTLC is created
     * @param sender Address that locked the tokens
     * @param receiver Address that can claim the tokens with preimage
     * @param tokenContract Address of the ERC20 token being locked
     * @param amount Actual amount of tokens locked (after any transfer fees)
     * @param hashlock Hash of the secret required to unlock tokens
     * @param timelock Block number when refund becomes available
     */
    event HTLCERC20New(
        address indexed sender,
        address indexed receiver,
        address tokenContract,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    );

    /**
     * @notice Emitted when tokens are successfully withdrawn
     * @param hashlock The hashlock identifier of the withdrawn contract
     */
    event HTLCERC20Withdraw(bytes32 indexed hashlock);

    /**
     * @notice Emitted when tokens are refunded to sender
     * @param hashlock The hashlock identifier of the refunded contract
     */
    event HTLCERC20Refund(bytes32 indexed hashlock);

    //////////////////////////////////////////////////////////////
    //                        STRUCTS                           //
    //////////////////////////////////////////////////////////////

    /**
     * @notice Structure containing all HTLC contract data
     * @param sender Address that created the contract and locked tokens
     * @param receiver Address that can withdraw tokens with valid preimage
     * @param tokenContract Address of the ERC20 token being held in escrow
     * @param amount Actual amount of tokens held (accounting for transfer fees)
     * @param timelock Block number when sender can reclaim tokens via refund
     * @param withdrawn True if tokens have been successfully withdrawn by receiver
     * @param refunded True if tokens have been refunded to sender after timelock
     * @param preimage The secret revealed during withdrawal (empty until withdrawn)
     */
    struct LockContract {
        address sender;
        address receiver;
        address tokenContract;
        uint256 amount;
        uint256 timelock;
        bool withdrawn;
        bool refunded;
        bytes32 preimage;
    }

    //////////////////////////////////////////////////////////////
    //                         ERRORS                           //
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when attempting to create contract with existing hashlock
    error ContractAlreadyExists();

    /// @notice Thrown when referencing a non-existent contract
    error ContractDoesNotExist();

    /// @notice Thrown when timelock is outside valid range
    error InvalidTimelock();

    /// @notice Thrown when amount is zero
    error InvalidAmount();

    /// @notice Thrown when address parameter is zero address
    error InvalidAddress();

    /// @notice Thrown when preimage is zero or invalid format
    error InvalidPreimage();

    /// @notice Thrown when preimage doesn't hash to the expected hashlock
    error HashMismatch();

    /// @notice Thrown when caller is not authorized for the operation
    error NotAuthorized();

    /// @notice Thrown when attempting to withdraw already withdrawn contract
    error AlreadyWithdrawn();

    /// @notice Thrown when attempting to refund already refunded contract
    error AlreadyRefunded();

    /// @notice Thrown when attempting refund before timelock expiry
    error TimelockNotExpired();

    /// @notice Thrown when token is not whitelisted (unused in current implementation)
    error TokenNotWhitelisted();

    /// @notice Thrown when insufficient token balance (unused in current implementation)
    error InsufficientTokenBalance();

    //////////////////////////////////////////////////////////////
    //                       MODIFIERS                          //
    //////////////////////////////////////////////////////////////

    /**
     * @notice Validates token transfer parameters
     * @dev Ensures token address is not zero and amount is positive
     * @param _token ERC20 token contract address
     * @param _amount Number of tokens to transfer
     */
    modifier validTokenTransfer(address _token, uint256 _amount) {
        if (_amount == 0) revert InvalidAmount();
        if (_token == address(0)) revert InvalidAddress();
        _;
    }

    /**
     * @notice Validates timelock is within acceptable bounds
     * @dev Ensures timelock is at least MIN_TIMELOCK_BLOCKS in future but not more than MAX_TIMELOCK_BLOCKS
     * @param _timelock Block number when refund becomes available
     */
    modifier validTimelock(uint256 _timelock) {
        if (_timelock > block.number + MAX_TIMELOCK_BLOCKS) revert InvalidTimelock();
        if (_timelock <= block.number + MIN_TIMELOCK_BLOCKS) revert InvalidTimelock();
        _;
    }

    /**
     * @notice Ensures referenced contract exists
     * @dev Checks if contract has been created by verifying sender is not zero address
     * @param _hashlock Unique identifier for the HTLC contract
     */
    modifier contractExists(bytes32 _hashlock) {
        if (contracts[_hashlock].sender == address(0)) revert ContractDoesNotExist();
        _;
    }

    /**
     * @notice Validates preimage matches the hashlock
     * @dev Prevents secret size attacks by ensuring preimage is non-zero and hashes correctly
     * @param _hashlock Expected hash of the preimage
     * @param _preimage Secret that should hash to _hashlock using SHA-256
     */
    modifier validPreimage(bytes32 _hashlock, bytes32 _preimage) {
        if (_preimage == bytes32(0)) revert InvalidPreimage();
        if (sha256(abi.encodePacked(_preimage)) != _hashlock) revert HashMismatch();
        _;
    }

    /**
     * @notice Authorizes withdrawal operation
     * @dev Ensures only designated receiver can withdraw and contract hasn't been withdrawn/refunded
     * @param _hashlock Unique identifier for the HTLC contract
     */
    modifier canWithdraw(bytes32 _hashlock) {
        LockContract storage c = contracts[_hashlock];
        if (c.receiver != msg.sender) revert NotAuthorized();
        if (c.withdrawn) revert AlreadyWithdrawn();
        if (c.refunded) revert AlreadyRefunded();
        _;
    }

    /**
     * @notice Authorizes refund operation
     * @dev Ensures only original sender can refund after timelock expires and contract hasn't been settled
     * @param _hashlock Unique identifier for the HTLC contract
     */
    modifier canRefund(bytes32 _hashlock) {
        LockContract storage c = contracts[_hashlock];
        if (c.sender != msg.sender) revert NotAuthorized();
        if (c.refunded) revert AlreadyRefunded();
        if (c.withdrawn) revert AlreadyWithdrawn();
        if (block.number < c.timelock) revert TimelockNotExpired();
        _;
    }

    //////////////////////////////////////////////////////////////
    //                        STORAGE                           //
    //////////////////////////////////////////////////////////////

    /// @notice Mapping from hashlock to HTLC contract data
    /// @dev Uses hashlock as unique identifier for each contract
    mapping(bytes32 => LockContract) public contracts;

    //////////////////////////////////////////////////////////////
    //                   EXTERNAL FUNCTIONS                     //
    //////////////////////////////////////////////////////////////

    /**
     * @notice Creates a new Hashed Timelock Contract
     * @dev Locks tokens in escrow until receiver provides preimage or sender reclaims after timelock.
     *      Handles fee-on-transfer tokens by checking actual received amount vs requested amount.
     *      Uses reentrancy protection to prevent malicious token callbacks.
     *
     * Requirements:
     * - Receiver address must not be zero
     * - Hashlock must not be zero
     * - No existing contract with same hashlock
     * - Token amount must be positive
     * - Timelock must be within valid bounds (MIN_TIMELOCK_BLOCKS to MAX_TIMELOCK_BLOCKS)
     * - Caller must have approved sufficient token allowance
     *
     * @param _receiver Address authorized to withdraw tokens with correct preimage
     * @param _hashlock SHA-256 hash of the secret required for withdrawal
     * @param _timelock Block number when refund becomes available to sender
     * @param _tokenContract Address of ERC20 token to be locked
     * @param _amount Number of tokens to lock (actual amount may differ for fee-on-transfer tokens)
     * @return hashlock The hashlock used as unique contract identifier
     *
     * @custom:security Fee-on-transfer tokens are handled by checking balance differential
     * @custom:security Reentrancy protection prevents malicious token callback attacks
     * @custom:gas-optimization Uses custom errors instead of require strings for lower gas costs
     */
    function newContract(
        address _receiver,
        bytes32 _hashlock,
        uint256 _timelock,
        address _tokenContract,
        uint256 _amount
    )
    external
    nonReentrant
    validTokenTransfer(_tokenContract, _amount)
    validTimelock(_timelock)
    returns (bytes32 hashlock)
    {
        // Validate input parameters
        if (_receiver == address(0)) revert InvalidAddress();
        if (_hashlock == bytes32(0)) revert InvalidPreimage();
        if (haveContract(_hashlock)) revert ContractAlreadyExists();

        // Handle fee-on-transfer tokens by checking actual received amount
        // This prevents accounting errors with deflationary tokens like STA, RFI, etc.
        uint256 balanceBefore = IERC20(_tokenContract).balanceOf(address(this));
        IERC20(_tokenContract).safeTransferFrom(msg.sender, address(this), _amount);
        uint256 balanceAfter = IERC20(_tokenContract).balanceOf(address(this));
        uint256 actualAmount = balanceAfter - balanceBefore;

        // Store contract data using hashlock as unique identifier
        contracts[_hashlock] = LockContract({
            sender: msg.sender,
            receiver: _receiver,
            tokenContract: _tokenContract,
            amount: actualAmount,  // Store actual received amount, not requested amount
            timelock: _timelock,
            withdrawn: false,
            refunded: false,
            preimage: bytes32(0)
        });

        emit HTLCERC20New(
            msg.sender,
            _receiver,
            _tokenContract,
            actualAmount,
            _hashlock,
            _timelock
        );

        return _hashlock;
    }

    /**
     * @notice Withdraws locked tokens by revealing the preimage
     * @dev Transfers tokens to receiver after validating the preimage hashes to the contract's hashlock.
     *      Uses Checks-Effects-Interactions pattern to prevent reentrancy attacks.
     *
     * Requirements:
     * - Contract must exist
     * - Caller must be the designated receiver
     * - Contract must not already be withdrawn or refunded
     * - Preimage must be valid (non-zero and hash to the hashlock)
     *
     * @param _hashlock Unique identifier of the HTLC contract
     * @param _preimage Secret value that hashes to the contract's hashlock
     * @return success True if withdrawal completed successfully
     *
     * @custom:security CEI pattern: state changes before external token transfer
     * @custom:security Reentrancy protection prevents malicious token callback attacks
     * @custom:security Preimage validation prevents secret size attacks in cross-chain scenarios
     */
    function withdraw(bytes32 _hashlock, bytes32 _preimage)
    external
    nonReentrant
    contractExists(_hashlock)
    validPreimage(_hashlock, _preimage)
    canWithdraw(_hashlock)
    returns (bool success)
    {
        LockContract storage c = contracts[_hashlock];

        // Update contract state before external call (Checks-Effects-Interactions pattern)
        c.preimage = _preimage;
        c.withdrawn = true;

        // Transfer tokens to receiver using SafeERC20 for compatibility
        IERC20(c.tokenContract).safeTransfer(c.receiver, c.amount);

        emit HTLCERC20Withdraw(_hashlock);
        return true;
    }

    /**
     * @notice Refunds locked tokens to sender after timelock expiry
     * @dev Returns tokens to original sender when timelock block is reached and receiver hasn't withdrawn.
     *      Uses Checks-Effects-Interactions pattern to prevent reentrancy attacks.
     *
     * Requirements:
     * - Contract must exist
     * - Caller must be the original sender
     * - Contract must not already be withdrawn or refunded
     * - Current block number must be >= timelock block number
     *
     * @param _hashlock Unique identifier of the HTLC contract
     * @return success True if refund completed successfully
     *
     * @custom:security CEI pattern: state changes before external token transfer
     * @custom:security Reentrancy protection prevents malicious token callback attacks
     * @custom:security Authorization check ensures only sender can trigger refund
     */
    function refund(bytes32 _hashlock)
    external
    nonReentrant
    contractExists(_hashlock)
    canRefund(_hashlock)
    returns (bool success)
    {
        LockContract storage c = contracts[_hashlock];

        // Update contract state before external call (Checks-Effects-Interactions pattern)
        c.refunded = true;

        // Return tokens to sender using SafeERC20 for compatibility
        IERC20(c.tokenContract).safeTransfer(c.sender, c.amount);

        emit HTLCERC20Refund(_hashlock);
        return true;
    }

    //////////////////////////////////////////////////////////////
    //                     VIEW FUNCTIONS                       //
    //////////////////////////////////////////////////////////////

    /**
     * @notice Retrieves complete details of an HTLC contract
     * @dev Returns all stored data for the specified contract. Returns zero values if contract doesn't exist.
     *
     * @param _hashlock Unique identifier of the HTLC contract
     * @return hashlock The hashlock identifier (same as input parameter)
     * @return sender Address that created and funded the contract
     * @return receiver Address authorized to withdraw with valid preimage
     * @return tokenContract Address of the ERC20 token held in escrow
     * @return amount Number of tokens locked in the contract
     * @return timelock Block number when refund becomes available
     * @return withdrawn True if tokens have been withdrawn by receiver
     * @return refunded True if tokens have been refunded to sender
     * @return preimage The revealed secret (empty until withdrawal)
     *
     * @custom:return-format Returns zero values for all fields if contract doesn't exist
     * @custom:gas-optimization View function - no state modifications, low gas cost
     */
    function getContract(bytes32 _hashlock)
    external
    view
    returns (
        bytes32 hashlock,
        address sender,
        address receiver,
        address tokenContract,
        uint256 amount,
        uint256 timelock,
        bool withdrawn,
        bool refunded,
        bytes32 preimage
    )
    {
        // Return zero values if contract doesn't exist
        if (!haveContract(_hashlock)) {
            return (0, address(0), address(0), address(0), 0, 0, false, false, 0);
        }

        LockContract storage c = contracts[_hashlock];
        return (
            _hashlock,
            c.sender,
            c.receiver,
            c.tokenContract,
            c.amount,
            c.timelock,
            c.withdrawn,
            c.refunded,
            c.preimage
        );
    }

    //////////////////////////////////////////////////////////////
    //                   INTERNAL FUNCTIONS                     //
    //////////////////////////////////////////////////////////////

    /**
     * @notice Checks if an HTLC contract exists
     * @dev Determines contract existence by checking if sender address is non-zero
     *
     * @param _hashlock Unique identifier to check
     * @return exists True if contract exists, false otherwise
     *
     * @custom:implementation Uses sender != address(0) as existence check since sender is always set during creation
     */
    function haveContract(bytes32 _hashlock)
    internal
    view
    returns (bool exists)
    {
        return contracts[_hashlock].sender != address(0);
    }
}