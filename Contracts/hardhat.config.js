require("@nomicfoundation/hardhat-toolbox");
const { subtask } = require("hardhat/config");
const {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
} = require("hardhat/builtin-tasks/task-names");
const path = require("path");
const solcJsPath = require.resolve("solc/soljson.js");

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }) => {
  return {
    version: solcVersion,
    longVersion: solcVersion,
    compilerPath: solcJsPath,
    isSolcJs: true,
  };
});

module.exports = {
  solidity: "0.8.19",
  paths: {
    sources: path.join(__dirname, "contracts"),
    artifacts: path.join(__dirname, "artifacts"),
  },
};
