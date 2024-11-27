// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Token is ERC20 {
    uint8 private _customDecimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        uint256 initialSupply
    ) ERC20(name, symbol) {
        _customDecimals = decimals_;
        _mint(msg.sender, initialSupply); // Mint initial supply to deployer
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }
}
