import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "hardhat";

const ForwarderHashedTimelockERC20Module = buildModule("ForwarderHashedTimelockERC20Module", (m) => {

  const htlc = m.contract("ForwarderHashedTimelockERC20", ["0x687bE257D3590697Da95a264154c71062C701936"]);

  return { htlc };
});

export default ForwarderHashedTimelockERC20Module;
