import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { deployContract, deployUpgradable } from '../utils/deploySimple'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, network } = hre
  const { deploy, fetchIfDifferent } = deployments
  const { deployer } = await getNamedAccounts()
  const deployerSigner = await ethers.getSigner(deployer);

  const insuranceMasterchef = await deployContract(hre, 'InsuranceMasterchef')
  const insuranceNft = await deployContract(hre, 'InsuranceNft')
  const insurancePool = await deployContract(hre, 'InsurancePool', insuranceNft.address, insuranceMasterchef.address)
  const insuranceFactory = await deployContract(hre, 'InsuranceFactory', insurancePool.address)
  
  const baseToken = await deployContract(hre, 'FakeUSDC')

  const earthRegistrarController = await deployContract(
    hre, 
    'EarthRegistrarController',
    deployer,
    '0xf26e227cc695ab105ff1dd76fedea7a6fb88274144cc3afa6533ec7d7151b22a',
    '0x888811a56d6816d86c81b60f47fd4dccbc03c2ee',
    '0x88881124bcf23860acca486f1f78dc073644f378',
    baseToken.address,
    insuranceFactory.address,
  )
}

func.id = 'ProjectRegistry'
func.tags = ['ProjectRegistry']
func.dependencies = []

export default func
