// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

interface IDevParameters {
  function investorDevFee() external view returns(uint256);
  function buyerDevFee() external view returns(uint256);
  function maxBuyerFee() external view returns(uint256);
}