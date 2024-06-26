#!/bin/bash

rm -rf node_modules
npm install --save-dev dotenv chai openzeppelin-solidity ethers hardhat@latest @nomicfoundation/hardhat-ethers@latest @nomiclabs/hardhat-waffle@latest
npm install --save-dev openzeppelin-solidity @openzeppelin/contracts