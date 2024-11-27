import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("TestToken", (m) => {
    const name = "TestToken";
    const symbol = "TD18";
    const decimals = 18; // Customize this
    const initialSupply = "1000000000000000000000000"; // 1,000,000 tokens (with decimals)

    // Get contract factory
    const erc20Token = m.contract("ERC20Token", [name, symbol, decimals, initialSupply]);
    // m.call(erc20Token, "transfer", []);

    return { erc20Token };
});