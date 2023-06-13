// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./InsurancePool.sol";
import "./IDevParameters.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract InsuranceFactory is Ownable, IDevParameters {
  address public immutable poolImplementation;

  // in BPS unit
  uint256 public investorDevFee = 4000;
  uint256 public buyerDevFee = 200;
  uint256 public maxBuyerFee = 2000;
  
  constructor(address _poolImplementation) {
    poolImplementation = _poolImplementation;
  }

  event DeployPool(address indexed owner, address indexed pool, uint256 expiration);
  function deployPool(
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
  ) public returns(InsurancePool pool) {
    pool = InsurancePool(Clones.clone(poolImplementation));
    pool.initialize(
      _owner, 
      _baseToken,
      _buyPercentageFee,
      _depositPercentageFee, 
      _depositLimit, 
      _distributionRatio, 
      _masterchefRatio, 
      _expiration, 
      _tokenName, 
      _tokenSymbol
    );

    emit DeployPool(_owner, address(pool), _expiration);
  }

  event UpdateInvestorDevFee(uint256 newFeeBps);
  function updateInvestorDevFee(uint256 feeBps) public onlyOwner {
    require(feeBps <= 10000, "Invalid fee");
    investorDevFee = feeBps;
    emit UpdateInvestorDevFee(feeBps);
  }

  event UpdateBuyerDevFee(uint256 newFeeBps);
  function updateBuyerDevFee(uint256 feeBps) public onlyOwner {
    // Limit to maxBuyerFee
    require(feeBps <= maxBuyerFee, "Invalid fee");
    buyerDevFee = feeBps;
    emit UpdateBuyerDevFee(feeBps);
  }

  event UpdateMaxBuyerFee(uint256 newFeeBps);
  function updateMaxBuyerFee(uint256 feeBps) public onlyOwner {
    require(feeBps <= 10000, "Invalid fee");
    maxBuyerFee = feeBps;
    emit UpdateMaxBuyerFee(feeBps);
  }
}