require('@nomicfoundation/hardhat-toolbox');

/**
 * MediConsent Hardhat configuration.
 * Local development only: the Hardhat network (chain id 31337) with test ETH.
 * No mainnet/testnet keys or real funds are ever used by this project.
 *
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  mocha: {
    timeout: 60000,
  },
};
