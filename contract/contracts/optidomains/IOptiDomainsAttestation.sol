// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "./AttestationStation.sol";
import "./INameWrapperRegistry.sol";

interface IOptiDomainsAttestation {
  function registry() external view returns(INameWrapperRegistry);
  function attestationStation() external view returns(AttestationStation);
  function attestationActivated() external view returns(bool);

  function readVersion(bytes32 node) external view returns(uint64);
  function readAttestation(address creator, bytes32 node, bytes32 key) external view returns(bytes memory);
  function readAttestation(bytes32 node, bytes32 key) external view returns(bytes memory);
  function readAttestationNV(address creator, bytes32 node, bytes32 key) external view returns(bytes memory);

  function buildAttestationData(bytes32 node, bytes32 key, uint256 flags, bytes memory value) external view returns(AttestationStation.AttestationData[] memory att);
  function attest(bytes32 node, bytes32 key, bytes memory value) external;
  function increaseVersion(bytes32 node) external;
}