// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ForwarderHashedTimelockERC20 is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    bool public incoming;

    address public counterparty;
    address public tokenContract;
    uint256 public amount;
    bytes32 public hashlock;
    uint256 public timelock;

    event HTLCERC20New(
        bool incoming,
        address indexed counterparty,
        address indexed tokenContract,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    );

    event HTLCERC20Settle(bytes32 indexed preimage, address tokenContract, uint256 amount);
    event HTLCERC20Refund(bytes32 indexed hashlock, address tokenContract, uint256 amount);
    event HTLCReset();

    constructor(address initialOwner) Ownable(initialOwner) { resetContractState(); }

    modifier futureTimelock(uint256 _time) {
        require(_time > block.timestamp, "Timelock time must be in the future");
        _;
    }

    modifier pastTimelock() {
        require(timelock <= block.timestamp, "Timelock not yet passed");
        _;
    }

    modifier hashlockMatches(bytes32 _hashlock, bytes32 _x) {
        require(_hashlock == sha256(abi.encodePacked(_x)), "Hashlock hash does not match");
        _;
    }

    modifier transferable() {
        require(counterparty == address(0), "Contract is in settlement state");
        _;
    }

    modifier locked() {
        require(counterparty != address(0), "Not in settlement state");
        _;
    }

    function route(
        address _counterparty,
        bool _incoming,
        bytes32 _hashlock,
        uint256 _timelock,
        address _tokenContract,
        uint256 _amount
    ) external futureTimelock(_timelock) returns (bool) {
        if (_incoming) {
            require(_amount > 0, "Token amount must be > 0");
            require(IERC20(_tokenContract).allowance(_counterparty, address(this)) >= _amount, "Token allowance must be >= amount");
            IERC20(_tokenContract).transferFrom(_counterparty, address(this), _amount);
        }

        incoming = _incoming;
        counterparty = _counterparty;
        tokenContract = _tokenContract;
        amount = _amount;
        timelock = _timelock;
        hashlock = _hashlock;

        emit HTLCERC20New(_incoming, _counterparty, _tokenContract, _amount, _hashlock, _timelock);

        return true;
    }

    function settle(bytes32 _preimage) external nonReentrant hashlockMatches(hashlock, _preimage) locked returns (bool) {
        if (incoming) {
            emit HTLCERC20Settle(_preimage, tokenContract, amount);
        } else {
            IERC20(tokenContract).transfer(counterparty, amount);
            emit HTLCERC20Settle(hashlock, tokenContract, amount);
        }
        resetContractState();
        return true;
    }

    function refund() external nonReentrant locked pastTimelock returns (bool) {
        if (!incoming) IERC20(tokenContract).transfer(counterparty, amount);
        emit HTLCERC20Refund(hashlock, tokenContract, amount);
        resetContractState();
        return true;
    }

    function transfer(address _tokenContract, address _counterparty, uint256 _amount) external onlyOwner transferable returns (bool) {
        IERC20(_tokenContract).transfer(_counterparty, _amount);
        return true;
    }

    function resetContractState() internal {
        counterparty = address(0);
        tokenContract = address(0);
        amount = 0;
        timelock = 0;
        hashlock = 0x0;
        emit HTLCReset();
    }
}
