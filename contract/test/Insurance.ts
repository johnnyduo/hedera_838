import { parseEther, formatEther } from "@ethersproject/units";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import { takeCoverage } from "v8";
import { deployContract, deployUpgradable } from "../utils/deploySimple";
import {
  generateBuySignature,
  generateClaimSignature,
  generateExtendSignature,
} from "../utils/signature";

const { insuranceOperatorPrivateKey } = require("../secrets.json");

const setupTest = deployments.createFixture(async (hre, options) => {
  const { deployments, getNamedAccounts, ethers } = hre;
  await deployments.fixture(); // ensure you start from a fresh deployments

  const {
    deployer,
    owner,
    insuranceOperator,
    insuranceOwner0,
    insuranceBuyer0,
    insuranceInvestor0,
    insuranceOwner1,
    insuranceBuyer1,
    insuranceInvestor1,
    insuranceOwner2,
    insuranceBuyer2,
    insuranceInvestor2,
    insuranceReferral,
  } = await getNamedAccounts();

  const InsuranceFactory = await ethers.getContract("InsuranceFactory", owner);
  await deployContract(hre, "TestERC20");
  const TestERC20 = await ethers.getContract("TestERC20", deployer);

  return {
    wallet: {
      deployer,
      owner,
      insuranceOperator,
      insuranceOwner0,
      insuranceBuyer0,
      insuranceInvestor0,
      insuranceOwner1,
      insuranceBuyer1,
      insuranceInvestor1,
      insuranceOwner2,
      insuranceBuyer2,
      insuranceInvestor2,
      insuranceReferral,
    },
    InsuranceFactory,
    TestERC20,
  };
});

function parseBps(value) {
  return parseInt(value.toString()) / 10000;
}

function assertNear(actual, expected, specialMode = 0) {
  try {
    expect(expected.sub(actual).abs()).to.lessThanOrEqual(ethers.BigNumber.from(10000));

    if (specialMode == 1) {
      expect(actual).to.lessThanOrEqual(expected);
    } else if (specialMode == 2) {
      expect(expected).to.lessThanOrEqual(actual);
    }
  } catch (err) {
    console.error(err)
    console.error("Expected:", expected.toString(), "Actual:", actual.toString());
  }
}

function assertDiff(balanceBefore, balanceAfter, target) {
  if (typeof balanceBefore === "number") {
    balanceBefore = parseEther(balanceBefore.toString());
  }

  if (typeof balanceAfter === "number") {
    balanceAfter = parseEther(balanceAfter.toString());
  }

  if (typeof target === "number") {
    target = parseEther(target.toString());
  }

  assertNear(balanceAfter.sub(balanceBefore), target);
}

async function getOwnerAndDevAddress(fixture, contract) {
  const dev = await fixture.InsuranceFactory.owner()
  const owner = await contract.owner()

  return { dev, owner }
}

async function deployPool(fixture, index: number, expiration: number) {
  const ownerWallet = fixture.wallet["insuranceOwner" + index];
  const tx = await fixture.InsuranceFactory.deployPool(
    ownerWallet, // Owner
    fixture.TestERC20.address, // Base token
    300, // Buyer percentage fee 3% (+ dev 2% = 5%)
    100, // Deposit percentage fee
    0, // Deposit limit
    2000, // Distribution ratio
    1000, // Masterchef ratio
    expiration, // Expiration
    "Test Token", // Token name
    "TEST" // Token symbol
  ).then((tx) => tx.wait());
  const event = tx.events.find((event) => event.event === "DeployPool");
  const [owner, poolAddress, exp] = event.args;

  const InsuranceFactory = await ethers.getContractFactory("InsuranceFactory");
  const InsurancePool = await ethers.getContractFactory("InsurancePool");
  const InsuranceNft = await ethers.getContractFactory("InsuranceNft");
  const InsuranceMasterchef = await ethers.getContractFactory(
    "InsuranceMasterchef"
  );

  const insurancePool = await InsurancePool.attach(poolAddress);
  const insuranceNft = await InsuranceNft.attach(await insurancePool.nft());
  const insuranceFactory = await InsuranceFactory.attach(
    await insurancePool.factory()
  );

  await insuranceNft
    .setOperator(fixture.wallet.insuranceOperator, true)
    .then((tx) => tx.wait());

  // Asserts
  expect(ownerWallet).to.equal(owner);
  expect(await insurancePool.owner()).to.equal(owner);
  expect(await insuranceNft.owner()).to.equal(owner);
  expect(await insuranceFactory.owner()).to.equal(fixture.wallet.deployer);

  return {
    pool: insurancePool,
    nft: insuranceNft,
    masterchef: await InsuranceMasterchef.attach(
      await insurancePool.masterchef()
    ),
    factory: insuranceFactory,
  };
}

async function InsurancePool(contract) {
  const Pool = await ethers.getContractFactory("InsurancePool");
  return await Pool.attach(await contract.pool());
}

async function InsuranceMasterchef(pool) {
  const Masterchef = await ethers.getContractFactory("InsuranceMasterchef");
  return await Masterchef.attach(await pool.masterchef());
}

async function assertPoolConstraints(fixture, pool) {
  const poolBalance = await fixture.TestERC20.balanceOf(pool.address);
  const rewardPerShare = await pool.rewardPerShare();
  const supplyAtExpired = await pool.supplyAtExpired();
  const totalSupply = await pool.totalSupply();
  const totalReward = rewardPerShare.mul(totalSupply).div("1000000000000000000");
  const keepProfit = await pool.keepProfit();

  let totalRewardDebt = ethers.BigNumber.from(0);

  for (let i = 0; i < 3; i++) {
    totalRewardDebt = totalRewardDebt.add(await pool.rewardDebt(fixture.wallet['insuranceInvestor' + i]))
  }

  if (supplyAtExpired.gt(0)) {
    const ratio = supplyAtExpired.add(keepProfit).mul("1000000000000000000").div(supplyAtExpired);
    const redeemable = totalSupply.mul(ratio).div("1000000000000000000");
    assertNear(totalReward.sub(totalRewardDebt), poolBalance.sub(redeemable), 1);
  } else {
    assertNear(totalReward.sub(totalRewardDebt), poolBalance.sub(totalSupply.add(keepProfit)), 1);
  }
  
}

async function assertBeforeBuy(fixture, index: number, nft) {
  const pool = await InsurancePool(nft);
  const masterchef = await InsuranceMasterchef(pool);
  const { owner, dev } = await getOwnerAndDevAddress(fixture, pool);

  const buyer = fixture.wallet["insuranceBuyer" + index];

  const buyerBalance = await fixture.TestERC20.balanceOf(buyer);
  const ownerBalance = await fixture.TestERC20.balanceOf(owner);
  const devBalance = await fixture.TestERC20.balanceOf(dev);
  const nftBalance = await fixture.TestERC20.balanceOf(nft.address);
  const poolBalance = await fixture.TestERC20.balanceOf(pool.address);
  const masterchefBalance = await fixture.TestERC20.balanceOf(masterchef.address);
  const referralBalance = await fixture.TestERC20.balanceOf(fixture.wallet.insuranceReferral);

  const rewardPerShare = await pool.rewardPerShare();

  expect(nftBalance.toString()).to.equal("0");

  console.log(buyerBalance)

  return {
    buyerBalance,
    ownerBalance,
    devBalance,
    nftBalance,
    poolBalance,
    masterchefBalance,
    referralBalance,
    rewardPerShare,
  }
}

async function assertAfterBuy(fixture, index: number, nft, price: number, referralPercentage: number, before) {
  const pool = await InsurancePool(nft);
  const masterchef = await InsuranceMasterchef(pool);
  const { owner, dev } = await getOwnerAndDevAddress(fixture, pool);

  const buyer = fixture.wallet["insuranceBuyer" + index];

  const buyerBalance = await fixture.TestERC20.balanceOf(buyer);
  const ownerBalance = await fixture.TestERC20.balanceOf(owner);
  const devBalance = await fixture.TestERC20.balanceOf(dev);
  const nftBalance = await fixture.TestERC20.balanceOf(nft.address);
  const poolBalance = await fixture.TestERC20.balanceOf(pool.address);
  const masterchefBalance = await fixture.TestERC20.balanceOf(masterchef.address);
  const referralBalance = await fixture.TestERC20.balanceOf(fixture.wallet.insuranceReferral);

  const totalSupply = await pool.totalSupply();
  const rewardPerShare = await pool.rewardPerShare();

  const buyPercentageFee = parseBps(await pool.buyPercentageFee());
  const devPercentageFee = parseBps(await nft.getBuyerDevFee());
  const distributionRatio = totalSupply == 0 ? 0 : parseBps(await pool.distributionRatio());
  const masterchefRatio = parseBps(await pool.masterchefRatio());

  const poolShare = price * (1 - devPercentageFee - buyPercentageFee - referralPercentage);

  console.log(buyerBalance)

  // 1st level distribute
  assertDiff(before.buyerBalance, buyerBalance, -price);
  assertDiff(before.ownerBalance, ownerBalance, price * buyPercentageFee);
  assertDiff(before.devBalance, devBalance, price * devPercentageFee);
  assertDiff(before.referralBalance, referralBalance, price * referralPercentage);
  
  // 2nd level distribute
  assertDiff(before.poolBalance, poolBalance, poolShare * (1 - masterchefRatio));
  assertDiff(before.masterchefBalance, masterchefBalance, poolShare * masterchefRatio);

  // Effects
  if (totalSupply.gt(0)) {
    expect(rewardPerShare.sub(before.rewardPerShare)).to.equal(
      parseEther((poolShare * distributionRatio).toString()).mul("1000000000000000000").div(totalSupply)
    )
  } else {
    assertDiff(before.rewardPerShare, rewardPerShare, 0);
  }

  expect(nftBalance.toString()).to.equal("0");

  await assertPoolConstraints(fixture, pool);
}

async function buyInsurance(
  fixture,
  index: number,
  nft: any,
  price: number,
  duration: number
) {
  const tokenId = Math.floor(Math.random() * 1000000);
  const to = fixture.wallet["insuranceBuyer" + index];
  const message = "0x1234";

  await fixture.TestERC20.mint(to, parseEther(price.toString())).then((tx) =>
    tx.wait()
  );
  await fixture.TestERC20.connect(await ethers.getSigner(to))
    .approve(nft.address, parseEther(price.toString()))
    .then((tx) => tx.wait());

  const before = await assertBeforeBuy(fixture, index, nft);

  const timestamp = await time.latest();

  const signature = await generateBuySignature(
    insuranceOperatorPrivateKey,
    nft.address,
    network.config.chainId as number,
    to,
    parseEther(price.toString()).toString(),
    tokenId,
    duration,
    fixture.wallet.insuranceReferral,
    100,
    timestamp + 3600,
    message
  );
  await nft
    .connect(await ethers.getSigner(to))
    .buyInsurance(signature.payload, message, signature.signature)
    .then((tx) => tx.wait());

  const insurancePool = await InsurancePool(nft);
  const rewardPerShare = await insurancePool.rewardPerShare();
  const keepProfit = await insurancePool.keepProfit();

  console.log("Reward Per Share", rewardPerShare.toString())
  console.log("Keep Profit", keepProfit.toString())
  // console.log("Total supply", (await insurancePool.totalSupply()).toString())

  await assertAfterBuy(fixture, index, nft, price, 0.01, before);

  const expiration = await nft.tokenExpiration(tokenId);
  const referralAddress = await nft.tokenReferralAddress(tokenId);
  const referralPercentage = await nft.tokenReferralPercentage(tokenId);

  expect(await nft.ownerOf(tokenId)).to.equal(to);
  expect(expiration.toNumber()).to.equal(await time.latest() + duration);
  expect(referralAddress).to.equal(fixture.wallet.insuranceReferral);
  expect(referralPercentage).to.equal(100);

  return tokenId;
}

async function extendInsurance(
  fixture,
  index: number,
  nft: any,
  tokenId: number,
  price: number,
  duration: number
) {
  const to = fixture.wallet["insuranceBuyer" + index];
  const message = "0x1234";

  await fixture.TestERC20.mint(to, parseEther(price.toString())).then((tx) =>
    tx.wait()
  );
  await fixture.TestERC20.connect(await ethers.getSigner(to))
    .approve(nft.address, parseEther(price.toString()))
    .then((tx) => tx.wait());

  const before = await assertBeforeBuy(fixture, index, nft);

  const timestamp = await time.latest();
  const expirationBefore = await nft.tokenExpiration(tokenId);

  const signature = await generateExtendSignature(
    insuranceOperatorPrivateKey,
    nft.address,
    network.config.chainId as number,
    parseEther(price.toString()).toString(),
    tokenId,
    duration,
    timestamp + 3600,
    message
  );
  await nft
    .connect(await ethers.getSigner(to))
    .extendInsurance(signature.payload, message, signature.signature)
    .then((tx) => tx.wait());

  const insurancePool = await InsurancePool(nft);
  const rewardPerShare = await insurancePool.rewardPerShare();
  const keepProfit = await insurancePool.keepProfit();
  const expirationAfter = await nft.tokenExpiration(tokenId);

  await assertAfterBuy(fixture, index, nft, price, 0.01, before);

  if (timestamp >= expirationBefore) {
    expect(expirationAfter.toNumber()).to.equal(await time.latest() + duration);
  } else {
    expect(expirationAfter.sub(expirationBefore).toNumber()).to.equal(duration);
  }

  console.log("Reward Per Share", rewardPerShare.toString())
  console.log("Keep Profit", keepProfit.toString())
  console.log("Total supply", (await insurancePool.totalSupply()).toString())

  return tokenId;
}

async function claimInsurance(
  fixture,
  index: number,
  nft: any,
  tokenId: number,
  amount: number
) {
  const insurancePool = await InsurancePool(nft);
  const to = fixture.wallet["insuranceBuyer" + index];
  const message = "0x1234";

  const timestamp = await time.latest();

  const buyerBalanceBefore = await fixture.TestERC20.balanceOf(to);
  const poolBalanceBefore = await fixture.TestERC20.balanceOf(insurancePool.address);
  const keepProfitBefore = await insurancePool.keepProfit();
  const rewardPerShareBefore = await insurancePool.rewardPerShare();

  const signature = await generateClaimSignature(
    insuranceOperatorPrivateKey,
    nft.address,
    network.config.chainId as number,
    to,
    parseEther(amount.toString()).toString(),
    tokenId,
    timestamp + 3600,
    message
  );
  await nft
    .connect(await ethers.getSigner(to))
    .claim(signature.payload, message, signature.signature)
    .then((tx) => tx.wait());

  const buyerBalanceAfter = await fixture.TestERC20.balanceOf(to);
  const poolBalanceAfter = await fixture.TestERC20.balanceOf(insurancePool.address);
  const keepProfitAfter = await insurancePool.keepProfit();
  const rewardPerShareAfter = await insurancePool.rewardPerShare();

  expect(rewardPerShareBefore).to.equal(rewardPerShareAfter);
  assertDiff(buyerBalanceBefore, buyerBalanceAfter, amount);
  assertDiff(poolBalanceBefore, poolBalanceAfter, -amount);
  assertDiff(keepProfitBefore, keepProfitAfter, -amount);

  await assertPoolConstraints(fixture, insurancePool);

  console.log("Reward Per Share", rewardPerShareAfter.toString())
  console.log("Keep Profit", keepProfitAfter.toString())
  console.log("Total supply", (await insurancePool.totalSupply()).toString())
}

async function assertHarvestBefore(fixture, index, pool) {
  const wallet = fixture.wallet["insuranceInvestor" + index];
  const pendingReward = await pool.getPendingReward(wallet);

  console.log("=== Harvesting " + index + " ===");
  console.log("Pending reward:", formatEther(pendingReward));

  return {
    pendingReward,
  }
}

async function assertHarvestAfter(fixture, index, pool, before) {
  const wallet = fixture.wallet["insuranceInvestor" + index];
  const pendingReward = await pool.getPendingReward(wallet);
  expect(pendingReward.toString()).to.equal("0")
  await assertPoolConstraints(fixture, pool);
}

async function insuranceDeposit(fixture, index, pool, amount) {
  const { owner, dev } = await getOwnerAndDevAddress(fixture, pool);
  
  const to = await ethers.getSigner(
    fixture.wallet["insuranceInvestor" + index]
  );

  await fixture.TestERC20.mint(to.address, parseEther(amount.toString())).then(
    (tx) => tx.wait()
  );
  await fixture.TestERC20.connect(to)
    .approve(pool.address, parseEther(amount.toString()))
    .then((tx) => tx.wait());

  const balanceShareBefore = await pool.balanceOf(to.address);

  const balanceInvestorBefore = await fixture.TestERC20.balanceOf(to.address)
  const balanceDevBefore = await fixture.TestERC20.balanceOf(dev)
  const balanceOwnerBefore = await fixture.TestERC20.balanceOf(owner)

  // Asserts before
  const before = await assertHarvestBefore(fixture, index, pool);

  await pool
    .connect(to)
    .deposit(to.address, parseEther(amount.toString()))
    .then((tx) => tx.wait());

  const depositPercentageFee =
    parseBps(await pool.depositPercentageFee());
  const devPercentageFee =
    parseBps(await pool.getInvestorDevFee());

  // Asserts after
  const balanceShareAfter = await pool.balanceOf(to.address);
  const balanceInvestorAfter = await fixture.TestERC20.balanceOf(to.address)
  const balanceDevAfter = await fixture.TestERC20.balanceOf(dev);
  const balanceOwnerfter = await fixture.TestERC20.balanceOf(owner);

  assertDiff(balanceInvestorBefore, balanceInvestorAfter, -amount + parseFloat(formatEther(before.pendingReward)))
  assertDiff(balanceShareBefore, balanceShareAfter, amount * (1 - depositPercentageFee))
  assertDiff(balanceDevBefore, balanceDevAfter, amount * (depositPercentageFee * devPercentageFee))
  assertDiff(balanceOwnerBefore, balanceOwnerfter, amount * (depositPercentageFee * (1 - devPercentageFee)))

  await assertHarvestAfter(fixture, index, pool, before);
}

async function insuranceWithdraw(fixture, index, pool, amount) {
  const to = await ethers.getSigner(
    fixture.wallet["insuranceInvestor" + index]
  );

  const balanceShareBefore = await pool.balanceOf(to.address);
  const balanceInvestorBefore = await fixture.TestERC20.balanceOf(to.address);
  const keepProfitBefore = await pool.keepProfit();
  const pendingReward = await pool.getPendingReward(to.address);

  // console.log(keepProfitBefore.toString());

  // Asserts before
  const before = await assertHarvestBefore(fixture, index, pool);

  await pool
    .connect(to)
    .withdraw(parseEther(amount.toString()))
    .then((tx) => tx.wait());

  const balanceShareAfter = await pool.balanceOf(to.address);
  const balanceInvestorAfter = (await fixture.TestERC20.balanceOf(to.address)).sub(pendingReward);
  const keepProfitAfter = await pool.keepProfit();

  assertDiff(balanceShareBefore, balanceShareAfter, -amount);

  if (keepProfitBefore.gte(0)) {
    assertDiff(balanceInvestorBefore, balanceInvestorAfter, amount);
  } else {
    const keepProfitDiff = keepProfitAfter.sub(keepProfitBefore)
    assertDiff(balanceInvestorBefore, balanceInvestorAfter, parseEther(amount.toString()).sub(keepProfitDiff));
  }

  await assertHarvestAfter(fixture, index, pool, before);
}

async function insuranceRedeem(fixture, index, pool, amount) {
  const to = await ethers.getSigner(
    fixture.wallet["insuranceInvestor" + index]
  );

  const balanceShareBefore = await pool.balanceOf(to.address);
  const balanceInvestorBefore = await fixture.TestERC20.balanceOf(to.address);
  const keepProfitBefore = await pool.keepProfit();

  // Asserts before
  const before = await assertHarvestBefore(fixture, index, pool);

  await pool
    .connect(to)
    .redeem(parseEther(amount.toString()))
    .then((tx) => tx.wait());

  const balanceShareAfter = await pool.balanceOf(to.address);
  const balanceInvestorAfter = await fixture.TestERC20.balanceOf(to.address);
  const keepProfitAfter = await pool.keepProfit();
  const supplyAtExpired = await pool.supplyAtExpired();
  const reserveAtExpired = keepProfitAfter.add(supplyAtExpired);

  const withdrawRatio = reserveAtExpired.mul("1000000000000000000").div(supplyAtExpired);

  assertDiff(balanceShareBefore, balanceShareAfter, -amount);
  expect(keepProfitBefore).to.equal(keepProfitAfter)
  assertDiff(balanceInvestorBefore, balanceInvestorAfter, parseEther(amount.toString()).mul(withdrawRatio).div("1000000000000000000").add(before.pendingReward));

  await assertHarvestAfter(fixture, index, pool, before);
}

describe("Insurance normal flow test 1", () => {
  let fixture, pool, nft, masterchef;
  let tokenId;

  before(async () => {
    fixture = await setupTest();
  });

  describe("Insurance owner", () => {
    it("Deploy insurace pool", async function () {
      const timestamp = await time.latest();

      const poolDeployment = await deployPool(fixture, 0, timestamp + 3600);

      pool = poolDeployment.pool;
      nft = poolDeployment.nft;
      masterchef = poolDeployment.masterchef;

      await deployPool(fixture, 1, timestamp + 3600);
      await deployPool(fixture, 2, 0);
    });
  });

  describe("Insurance buyer", () => {
    it("Buy insurace", async function () {
      tokenId = await buyInsurance(fixture, 0, nft, 2000, 24 * 3600);
    });

    it("Claim insurace", async function () {
      await claimInsurance(fixture, 0, nft, tokenId, 1000);
    });

    it("Extend insurace", async function () {
      await extendInsurance(fixture, 0, nft, tokenId, 1000, 1 * 3600);
    });

    it("Buy insurace again", async function () {
      await buyInsurance(fixture, 0, nft, 500, 1 * 3600);
      await buyInsurance(fixture, 1, nft, 500, 2 * 3600);
    });
  });

  describe("Insurance investor", () => {
    it("Deposit to insurance", async function () {
      await insuranceDeposit(fixture, 0, pool, 1000);
    });

    it("Buy insurace", async function () {
      await buyInsurance(fixture, 0, nft, 500, 1 * 3600);
      await buyInsurance(fixture, 1, nft, 500, 2 * 3600);
    });

    it("Deposit to insurance again", async function () {
      await insuranceDeposit(fixture, 0, pool, 1000);
    });

    it("Deposit to insurance from new wallet", async function () {
      await insuranceDeposit(fixture, 1, pool, 1000);
    });

    it("Partially withdraw from insurance", async function () {
      await insuranceWithdraw(fixture, 0, pool, 1000);
    });
  });

  describe("Insurance in loss", () => {
    it("Claim insurace to make it in loss", async function () {
      await claimInsurance(fixture, 0, nft, tokenId, 5000);
    });

    it("Partially withdraw from insurance", async function () {
      await insuranceWithdraw(fixture, 0, pool, 500);
    });

    it("Deposit to insurance", async function () {
      await insuranceDeposit(fixture, 0, pool, 1000);
    });

    it("Buy insurace", async function () {
      await buyInsurance(fixture, 0, nft, 500, 1 * 3600);
      await buyInsurance(fixture, 1, nft, 500, 2 * 3600);
    });
  });

  describe("Insurance redeem", () => {
    it("Make insurance expire", async function () {
      await time.increase(3601)
    })

    it("Redeem insurance partially", async function () {
      await insuranceRedeem(fixture, 0, pool, 1000)
    })
  });
});

describe("Extreme withdraw tests", () => {
  describe("Claim to zero", () => {
    let fixture, pool, nft, masterchef;
    let tokenId;

    before(async () => {
      fixture = await setupTest();
    });

    it("Deploy insurace pool", async function () {
      const timestamp = await time.latest();

      const poolDeployment = await deployPool(fixture, 0, timestamp + 3600);

      pool = poolDeployment.pool;
      nft = poolDeployment.nft;
      masterchef = poolDeployment.masterchef;
    });

    it("Buy insurace", async function () {
      tokenId = await buyInsurance(fixture, 0, nft, 2000, 24 * 3600);
    });

    it("Deposit to insurance", async function () {
      await insuranceDeposit(fixture, 0, pool, 1000);
    });

    it("Claim insurace", async function () {
      // const keepProfit = await pool.keepProfit();
      // const totalSupply = await pool.totalSupply();
      const poolBalance = await fixture.TestERC20.balanceOf(pool.address);
      // console.log(keepProfit.toString(), poolBalance.toString(), totalSupply.toString())
      await claimInsurance(fixture, 0, nft, tokenId, parseFloat(formatEther(poolBalance)));
      // console.log((await pool.keepProfit()).toString())
    });

    it("Buy insurace", async function () {
      tokenId = await buyInsurance(fixture, 0, nft, 2000, 24 * 3600);
    });

    it("Withdraw all insurace", async function () {
      const shareBalance = await pool.balanceOf(fixture.wallet.insuranceInvestor0)
      await insuranceWithdraw(fixture, 0, pool, parseFloat(formatEther(shareBalance)));
    });
  })
});
