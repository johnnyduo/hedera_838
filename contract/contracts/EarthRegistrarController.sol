// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "./optidomains/INameWrapper.sol";
import "./optidomains/AttestationStation.sol";
import "./optidomains/IOptiDomainsAttestation.sol";
import "./InsuranceFactory.sol";
import "./InsurancePool.sol";

import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

bytes32 constant INSURANCE_DETAIL = keccak256("838.earth.detail");
bytes32 constant INSURANCE_VALIDATION = keccak256("838.earth.validation");

error Forbidden();

interface IEarthResolver {
  event AddrChanged(bytes32 indexed node, address a);

  /**
   * Returns the address associated with an ENS node.
   * @param node The ENS node to query.
   * @return The associated address.
   */
  function addr(bytes32 node) external view returns (address payable);

  /**
   * Sets the address associated with an ENS node.
   * May only be called by the owner of that node in the ENS registry.
   * @param node The node to update.
   * @param a The address to set.
   */
  function setAddr(
    bytes32 node,
    address a
  ) external;

  function setEarthKyc(bytes32 node, bytes32 kycHash) external;
  function earthKyc(bytes32 node) external view returns(bytes32);
}

contract EarthRegistrarController is Ownable, ERC1155Holder {
  mapping(address => bool) public isValidator;

  address immutable operator;
  bytes32 public immutable rootNode;
  INameWrapper public immutable nameWrapper;
  IEarthResolver public immutable resolver;
  IERC20 public immutable baseToken;
  InsuranceFactory public immutable factory;

  // AttestationStation public immutable attestationStation;
  // IOptiDomainsAttestation public immutable attestationDomain;

  struct PartnerGoal {
    uint256 method;
    uint256 year;
    InsurancePool pool;
  }

  mapping(bytes32 => PartnerGoal) public partnerGoal;

  struct InsuranceDetail {
    bytes32 partner;
    uint256 goalMethod;
    uint256 goalYear;
    uint256 goalTon;
    uint256 acheivedTon;
    uint256 premium;
  }

  mapping(bytes32 => InsuranceDetail) public insuranceDetail;

  mapping(bytes32 => address) public domainOwner;

  constructor(
    address _operator,
    bytes32 _rootNode, 
    INameWrapper _nameWrapper,
    IEarthResolver _resolver,
    IERC20 _baseToken,
    InsuranceFactory _factory
    // IOptiDomainsAttestation _attestation
  ) {
    operator = _operator;
    rootNode = _rootNode;
    nameWrapper = _nameWrapper;
    resolver = _resolver;
    baseToken = _baseToken;
    factory = _factory;

    // attestationDomain = _attestation;
    // attestationStation = _attestation.attestationStation();
  }

  function register(string calldata name, address owner, uint64 expiration, bytes32 kycHash, bytes calldata signature) public {
    // Reduce time to integrate frontend
    // if (
    //   !SignatureChecker.isValidSignatureNow(
    //     operator,
    //     keccak256(
    //       abi.encodePacked(
    //         bytes1(0x19),
    //         bytes1(0),
    //         address(this),
    //         uint256(block.chainid),
    //         bytes32(
    //           0xdd007bd789f73e08c2714644c55b11c7d202931d717def434e3c9caa12a9f583
    //         ), // keccak256("register")
    //         name,
    //         owner,
    //         expiration,
    //         kycHash
    //       )
    //     ),
    //     signature
    //   )
    // ) {
    //   revert Forbidden();
    // }

    bytes32 node = keccak256(abi.encodePacked(rootNode, keccak256(bytes(name))));
    
    nameWrapper.setSubnodeOwner(rootNode, name, address(this), 0, expiration);
    nameWrapper.setResolver(node, address(resolver));
    resolver.setAddr(node, owner);
    resolver.setEarthKyc(node, kycHash);

    domainOwner[node] = owner;
  }

  function deployPartner(bytes32 node, uint256 method, uint256 year) public {
    require(method != 0, "Unknown method");
    require(year != 0, "Unknown year");
    require(msg.sender == domainOwner[node], "Not owner");

    InsurancePool pool = factory.deployPool(
      domainOwner[node],
      baseToken,
      0,
      0,
      0,
      3500,
      0,
      1893460000 + 31600000 * (year - 2030),
      "838.Earth",
      "EARTH"
    );

    partnerGoal[node] = PartnerGoal({
      method: method,
      year: year,
      pool: pool
    });
  }

  function deployValidator(address _validator, bool _enabled) public onlyOwner {
    isValidator[_validator] = _enabled;
  }

  event BuyInsurance(bytes32 node, bytes32 partner, string name, uint256 goalTon, uint256 premium);
  function buyInsurance(
    bytes32 node,
    bytes32 partner,
    string calldata name,

    uint256 goalTon,
    uint256 premium
  ) public {
    require(partnerGoal[partner].method > 0, "Not registered");

    address owner = nameWrapper.ownerOf(uint256(node));
    nameWrapper.setSubnodeOwner(node, name, owner, 0, uint64(block.timestamp + 365 days));

    insuranceDetail[node] = InsuranceDetail({
      partner: partner,
      goalMethod: partnerGoal[partner].method,
      goalYear: partnerGoal[partner].year,
      goalTon: goalTon,
      acheivedTon: 0,
      premium: premium
    });

    // attestationStation.attest(attestationDomain.buildAttestationData(node, INSURANCE_DETAIL, 4, abi.encode(insuranceDetail[node])));

    baseToken.transferFrom(msg.sender, address(partnerGoal[partner].pool), premium);

    partnerGoal[partner].pool.distribute(premium);

    emit BuyInsurance(node, partner, name, goalTon, premium);
  }

  event AttestProgress(address validator, bytes32 node, uint256 acheivedTon);
  function attestProgress(bytes32 node, uint256 acheivedTon) public {
    require(isValidator[msg.sender], "Not a validator");

    InsuranceDetail storage oldDetail = insuranceDetail[node];

    insuranceDetail[node] = InsuranceDetail({
      partner: oldDetail.partner,
      goalMethod: oldDetail.goalMethod,
      goalYear: oldDetail.goalYear,
      goalTon: oldDetail.goalTon,
      acheivedTon: acheivedTon,
      premium: oldDetail.premium
    });

    // attestationStation.attest(attestationDomain.buildAttestationData(node, INSURANCE_DETAIL, 4, abi.encode(insuranceDetail[node])));
    // attestationStation.attest(msg.sender, INSURANCE_VALIDATION, abi.encode(msg.sender, node, acheivedTon));

    emit AttestProgress(msg.sender, node, acheivedTon);
  }

  // DEBUG only
  function takeoverRootNode() public onlyOwner {
    nameWrapper.safeTransferFrom(address(this), msg.sender, uint256(rootNode), 1, "");
  }

  // For fast frontend development
  function insuranceDetails(bytes32[] calldata ids) public view returns(InsuranceDetail[] memory details) {
    details = new InsuranceDetail[](ids.length);

    unchecked {
      for (uint i; i < ids.length; ++i) {
        details[i] = insuranceDetail[ids[i]];
      }
    }
  }

}