/* SPDX-License-Identifier: GNU */
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * A basic token for testing the HashedTimelockERC20.
 */
contract BobERC20 is ERC20 {
    constructor(uint256 _initialBalance) ERC20("Bob Token", "BobToken") {
        _mint(msg.sender, _initialBalance);
    }
}
