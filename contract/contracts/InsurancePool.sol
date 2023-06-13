// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "./IDistribute.sol";
import "./IDevParameters.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

error InvalidPercentage();
error Zero();
error Expired(uint256 expiration);
error NotExpired(uint256 expiration);
error DepositLimit();
error OutOfReserve();
error WithdrawBug();

interface INftInitializer {
  function initialize(
    address _pool,
    IERC20 _baseToken,
    string memory _tokenName,
    string memory _tokenSymbol
  ) external;
}

interface IMasterchefInitializer is IDistribute {
	function initialize(
    address _insurancePool,
		address _baseToken
	) external;
}

contract InsurancePool is ERC20Upgradeable, OwnableUpgradeable, IDistribute {
  using SafeERC20 for IERC20;

  address public immutable nftImplementation;
  address public immutable masterchefImplementation;

  IERC20 public baseToken;

  address public factory;
  address public nft;
  IMasterchefInitializer public masterchef;

  uint256 public rewardPerShare;
  mapping(address => uint256) public rewardDebt; 

  uint256 public buyPercentageFee;
  uint256 public depositPercentageFee;
  uint256 public depositLimit;

  uint256 public distributionRatio;
  uint256 public masterchefRatio;

  uint256 public expiration;

  // This track profit of token stored in the insurance
  int256 public keepProfit;

  // in BPS unit
  uint256 private investorDevFee;

  uint256 public supplyAtExpired;

  modifier onlyNft {
    // TODO: HACKATHON only: Remove security for time trade off
    // require(msg.sender == nft, "Not NFT");
    _;
  }

  function isGovernance(address addr) public view returns(bool) {
    return addr == owner() || addr == OwnableUpgradeable(factory).owner();
  }

  modifier onlyGovernance {
    require(isGovernance(msg.sender), "Ownable: caller is not the owner");
    _;
  }

  constructor(
    address _nftImplementation,
    address _masterchefImplementation
  ) {
    nftImplementation = _nftImplementation;
    masterchefImplementation = _masterchefImplementation;
  }

  function getInvestorDevFee() public view returns(uint256) {
    if (investorDevFee == 10001) {
      return IDevParameters(factory).investorDevFee();
    }
    return investorDevFee;
  }

  event UpdateInvestorDevFee(uint256 newFeeBps);
  function updateInvestorDevFee(uint256 feeBps) public {
    require(msg.sender == OwnableUpgradeable(factory).owner(), "Not dev");
    require(feeBps <= 10001, "Invalid fee");
    investorDevFee = feeBps;
    emit UpdateInvestorDevFee(feeBps);
  }

  event PoolInitialize(address indexed owner, address indexed nftContract, address indexed masterchefContract, uint256 expiration);
  function initialize(
    address _owner,
    IERC20 _baseToken,
    uint256 _buyPercentageFee,
    uint256 _depositPercentageFee,
    uint256 _depositLimit,
    uint256 _distributionRatio,
    uint256 _masterchefRatio,
    uint256 _expiration,
    string memory _tokenName,
    string memory _tokenSymbol
  ) external initializer {
    if (!(_distributionRatio <= 10000 && _masterchefRatio <= 10000 && _depositPercentageFee <= 10000 && 10000 - _distributionRatio - _masterchefRatio >= 0)) {
      revert InvalidPercentage();
    }

    investorDevFee = 10001;
    
    factory = msg.sender;

    if (IDevParameters(factory).buyerDevFee() + _buyPercentageFee > IDevParameters(factory).maxBuyerFee()) {
      revert InvalidPercentage();
    }

    nft = Clones.clone(nftImplementation);
    INftInitializer(nft).initialize(address(this), _baseToken, _tokenName, _tokenSymbol);

    masterchef = IMasterchefInitializer(Clones.clone(masterchefImplementation));
    masterchef.initialize(address(this), address(_baseToken));

    baseToken = _baseToken;

    buyPercentageFee = _buyPercentageFee;
    depositPercentageFee = _depositPercentageFee;
    depositLimit = _depositLimit;

    distributionRatio = _distributionRatio;
    masterchefRatio = _masterchefRatio;

    expiration = _expiration;

    _transferOwnership(_owner);
    __ERC20_init(_tokenName, _tokenSymbol);

    emit PoolInitialize(_owner, address(nft), address(masterchef), _expiration);
  }

  function getParameters() public view returns(
    address _owner,
    IERC20 _baseToken,
    uint256 _buyPercentageFee,
    uint256 _depositPercentageFee,
    uint256 _depositLimit,
    uint256 _distributionRatio,
    uint256 _masterchefRatio,
    uint256 _expiration,
    string memory _tokenName,
    string memory _tokenSymbol
  ) {
    _owner = owner();
    _baseToken = baseToken;
    _buyPercentageFee = buyPercentageFee;
    _depositPercentageFee = depositPercentageFee;
    _depositLimit = depositLimit;
    _distributionRatio = distributionRatio;
    _masterchefRatio = masterchefRatio;
    _expiration = expiration;
    _tokenName = name();
    _tokenSymbol = symbol();
  }

  event SetDepositLimit(uint256 newLimit);
  function setDepositLimit(uint256 newLimit) public onlyGovernance {
    depositLimit = newLimit;
    emit SetDepositLimit(newLimit);
  }

  event SetBuyPercentageFee(uint256 newPercentageFee);
  function setBuyPercentageFee(uint256 newPercentageFee) public onlyGovernance {
    if (IDevParameters(factory).buyerDevFee() + newPercentageFee > IDevParameters(factory).maxBuyerFee()) {
      revert InvalidPercentage();
    }
    buyPercentageFee = newPercentageFee;
    emit SetBuyPercentageFee(newPercentageFee);
  }

  event SetDepositPercentageFee(uint256 newPercentageFee);
  function setDepositPercentageFee(uint256 newPercentageFee) public onlyGovernance {
    if (newPercentageFee > 10000) revert InvalidPercentage();
    depositPercentageFee = newPercentageFee;
    emit SetDepositPercentageFee(newPercentageFee);
  }

  event SetDistributionRatio(uint256 newRatio);
  function setDistributionRatio(uint256 newRatio) public onlyGovernance {
    if (newRatio > 10000) revert InvalidPercentage();
    distributionRatio = newRatio;
    emit SetDistributionRatio(newRatio);
  }

  event SetMasterchefRatio(uint256 newRatio);
  function setMasterchefRatio(uint256 newRatio) public onlyGovernance {
    if (newRatio > 10000) revert InvalidPercentage();
    masterchefRatio = newRatio;
    emit SetMasterchefRatio(newRatio);
  }

  function getPendingReward(address wallet) public view returns(uint256) {
    uint256 rewardFromShare = rewardPerShare * balanceOf(wallet) / 1e18;
    uint256 amount = rewardFromShare - rewardDebt[wallet];
    return amount;
  }

  event Harvest(address to, uint256 amount);
  function harvest(address to) public {
    if (to != address(0)) {
      uint256 rewardFromShare = rewardPerShare * balanceOf(to) / 1e18;
      uint256 amount = rewardFromShare - rewardDebt[to];
      baseToken.safeTransfer(to, amount);
      rewardDebt[to] = rewardFromShare;
      emit Harvest(to, amount);
    }
  }

  event Deposit(address indexed payer, address indexed to, uint256 amount, uint256 fee);
  function deposit(address to, uint256 amount) public {
    if (amount == 0) revert Zero();
    if (expiration != 0 && block.timestamp > expiration) revert Expired(expiration);

    // Note: To pause deposit, set deposit limit to <= total supply but not zero
    if (depositLimit != 0 && depositLimit + amount > totalSupply()) revert DepositLimit();

    harvest(to);

    baseToken.safeTransferFrom(msg.sender, address(this), amount);

    uint256 fee = amount * depositPercentageFee * (10000 - getInvestorDevFee()) / 1e8;
    uint256 devFee = amount * depositPercentageFee * getInvestorDevFee() / 1e8;

    baseToken.safeTransfer(owner(), fee);
    baseToken.safeTransfer(OwnableUpgradeable(factory).owner(), devFee);

    _mint(to, amount - fee - devFee);

    rewardDebt[to] = rewardPerShare * balanceOf(to) / 1e18;

    emit Deposit(msg.sender, to, amount, fee);
  }

  event Distribute(uint256 amount, int256 keepProfit, uint256 rewardPerShare);
  function distribute(uint256 amount) public onlyNft {
    // NFT contract is responsible for transferring base amount

    if (amount == 0) revert Zero();
    if (expiration != 0 && block.timestamp > expiration) revert Expired(expiration);

    uint256 distributeAmount = amount * distributionRatio / 10000;

    keepProfit += int256(amount - distributeAmount);

    if (masterchefRatio > 0) {
      uint256 masterchefAmount = amount * masterchefRatio / 10000;
      baseToken.safeTransfer(address(masterchef), masterchefAmount);
      masterchef.distribute(masterchefAmount);
      keepProfit -= int256(masterchefAmount);
    }

    if (totalSupply() == 0) {
      // Refund distributeAmount back to the pool
      keepProfit += int256(distributeAmount);
    } else {
      rewardPerShare += distributeAmount * 1e18 / totalSupply();
    }

    emit Distribute(amount, keepProfit, rewardPerShare);
  }

  event Claim(uint256 amount, int256 keepProfit);
  function claim(address to, uint256 amount) public onlyNft {
    if (amount == 0) revert Zero();
    if (expiration != 0 && block.timestamp > expiration) revert Expired(expiration);

    keepProfit -= int256(amount);
    if (keepProfit < -int256(totalSupply())) revert OutOfReserve();
    baseToken.safeTransfer(to, amount);
    emit Claim(amount, keepProfit);
  }

  event Redeem(address indexed redeemer, uint256 amount, uint256 total);
  function redeem(uint256 amount) public {
    if (amount == 0) revert Zero();
    // If no expiration -> can't redeem
    if (expiration == 0 || block.timestamp <= expiration) revert NotExpired(expiration);

    if (supplyAtExpired == 0) {
      supplyAtExpired = totalSupply();
    }

    int256 supply = int256(supplyAtExpired);
    int256 totalInt = (supply + keepProfit) * int256(amount) / supply;

    if (totalInt <= 0) {
      revert WithdrawBug();
    }
    
    uint256 total = uint256(totalInt);

    _burn(msg.sender, amount);
    baseToken.safeTransfer(msg.sender, total);

    emit Redeem(msg.sender, amount, total);
  }

  // Take loss but not take profit
  event Withdraw(address indexed withdrawer, uint256 amount, uint256 total);
  function withdraw(uint256 amount) public {
    if (amount == 0) revert Zero();
    // If expired -> use redeem instead
    if (expiration != 0 && block.timestamp > expiration) revert Expired(expiration);

    int256 supply = int256(totalSupply());
    int256 totalInt = keepProfit >= 0 ? int256(amount) : (supply + keepProfit) * int256(amount) / supply;

    if (totalInt <= 0) {
      revert WithdrawBug();
    }

    keepProfit += int256(amount) - totalInt;

    uint256 total = uint256(totalInt);

    _burn(msg.sender, amount);
    baseToken.safeTransfer(msg.sender, total);

    emit Withdraw(msg.sender, amount, total);
  }

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256
  ) internal virtual override {
    harvest(from);
    harvest(to);
  }

  function _afterTokenTransfer(
    address from,
    address to,
    uint256
  ) internal virtual override {
    rewardDebt[from] = rewardPerShare * balanceOf(from) / 1e18;
    rewardDebt[to] = rewardPerShare * balanceOf(to) / 1e18;
  }
}