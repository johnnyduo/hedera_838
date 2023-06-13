import { ethers } from "hardhat";

async function main() {
  const EarthResolver = await ethers.getContractFactory("EarthResolver");
  const earthResolver = await EarthResolver.deploy();

  await earthResolver.deployed();

  console.log("EarthResolver deployed to", earthResolver.address)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
