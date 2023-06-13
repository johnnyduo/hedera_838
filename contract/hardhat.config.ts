import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-etherscan";
import '@nomiclabs/hardhat-ethers';
import "@typechain/hardhat";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-deploy";
import 'solidity-coverage'

const { privateKey, explorerApiKey } = require('./secrets.json');

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 300,
            details: {
              yul: true
            },
          }
        }
      }
    ]
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://bscscan.com/
    apiKey: explorerApiKey
  },
  networks: {
    hardhat: {
      chainId: 31337,
      // forking: {
      //   url: "https://speedy-nodes-nyc.moralis.io/301eb738d0e9755bd1c8b3e8/bsc/mainnet/archive",
      // }
    },
    localhost:{
      
    },

    optimism_goerli: {
      url: `https://opt-goerli.g.alchemy.com/v2/Uqc2nrzJBeN1oVuuDQ0ON_aPUokXzApf`,
      tags: ['test', 'use_root'],
      chainId: 420,
      accounts: [privateKey],
    },
		goerli: {
      url: "https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
      chainId: 5,
      accounts: [privateKey]
    },

		gnosis_testnet: {
      url: "https://rpc.chiadochain.net",
      chainId: 10200,
      accounts: [privateKey]
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    owner: {
      default: 0,
    },

    // Test cases
    insuranceOperator: {
      default: "0x00F2e23Dc45eBD805392c90c663d96c47a9c2d33",
    },

    insuranceOwner0: {
      default: 1,
    },
    insuranceBuyer0: {
      default: 2,
    },
    insuranceInvestor0: {
      default: 3,
    },

    insuranceOwner1: {
      default: 4,
    },
    insuranceBuyer1: {
      default: 5,
    },
    insuranceInvestor1: {
      default: 6,
    },

    insuranceOwner2: {
      default: 7,
    },
    insuranceBuyer2: {
      default: 8,
    },
    insuranceInvestor2: {
      default: 9,
    },

    insuranceReferral: {
      default: 10,
    }
  },
};

export default config;
