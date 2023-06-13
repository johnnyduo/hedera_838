import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { DeployFunction, DeployResult } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

interface DeployResultWithContract extends DeployResult {
  contract: Contract
}

export async function deployContract(hre: HardhatRuntimeEnvironment, name: string, ...args: any[]): Promise<DeployResultWithContract> {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  const deployArgs = {
    from: deployer,
    args,
    log: true,
  };

  const deployment = await deploy(name, deployArgs);
  const contract = await ethers.getContract(name);

  return {
    ...deployment,
    contract,
  }
}

export async function deployUpgradable(hre: HardhatRuntimeEnvironment, name: string, ...args: any[]): Promise<DeployResultWithContract> {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  const deployArgs = {
    from: deployer,
    proxy: {
      proxyContract: 'OptimizedTransparentProxy',
      methodName: 'initialize',
    },
    args,
    log: true,
  };

  const deployment = await deploy(name, deployArgs);
  const contract = await ethers.getContract(name);

  return {
    ...deployment,
    contract,
  }
}