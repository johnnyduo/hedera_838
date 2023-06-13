// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "./InsurancePool.sol";
import "./IDevParameters.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "./meta-transactions/EIP712Base.sol";

error TokenIdUsed(uint256 tokenId);
error TokenNotExists(uint256 tokenId);
error NotOperator(address wallet);
error OnlyOwner();
error NonceReused(uint256 nonce);
error TooMuchFee(uint256 fee);
error InvalidMessageHash();
error InvalidTypeHash();

contract InsuranceNft is ERC721EnumerableUpgradeable, EIP712Base {
  using SafeERC20 for IERC20;
  
  InsurancePool public pool;
  IERC20 public baseToken;

  string _name;
  string _symbol;

  mapping(address => bool) public operators;
  mapping(uint256 => bytes) public tokenMessage;
  mapping(uint256 => uint256) public tokenExpiration;
  mapping(uint256 => mapping(uint256 => bool)) public tokenNonce;

  mapping(uint256 => address) public tokenReferralAddress;
  mapping(uint256 => uint256) public tokenReferralPercentage;

  // in BPS unit
  uint256 private buyerDevFee;

  // EIP-712 typehash
  bytes32 private constant BUY_TYPEHASH = keccak256(
    bytes(
      "BuyInsurance(address to,uint256 price,uint256 tokenId,uint256 duration,address referral,uint256 referralPercentage,uint256 expiration,bytes message)"
    )
  );

  bytes32 private constant EXTEND_TYPEHASH = keccak256(
    bytes(
      "ExtendInsurance(uint256 price,uint256 tokenId,uint256 nonce,uint256 duration,uint256 expiration,bytes message)"
    )
  );

  bytes32 private constant CLAIM_TYPEHASH = keccak256(
    bytes(
      "Claim(address to,uint256 amount,uint256 tokenId,uint256 nonce,uint256 expiration,bytes message)"
    )
  );

  /**
   * @dev Tells the address of the owner
   * @return the address of the owner
   */
  function owner() public view returns(address) {
    return pool.owner();
  }

  modifier onlyOwner() {
    require(pool.isGovernance(msg.sender), "Ownable: caller is not the owner");
    _;
  }

  function initialize(
    address _pool,
    IERC20 _baseToken,
    string memory _tokenName,
    string memory _tokenSymbol
  ) external initializer {
    buyerDevFee = 10001;
    pool = InsurancePool(_pool);
    baseToken = _baseToken;
    __ERC721_init(_tokenName, _tokenSymbol);
    _initializeEIP712("InsuranceNft");
  }

  function getMaxBuyerFee() public view returns (uint256) {
    return IDevParameters(pool.factory()).maxBuyerFee();
  }

  function getBuyerDevFee() public view returns (uint256) {
    if (buyerDevFee == 10001) {
      return IDevParameters(pool.factory()).buyerDevFee();
    }
    return buyerDevFee;
  }

  event UpdateBuyerDevFee(uint256 newFeeBps);
  function updateBuyerDevFee(uint256 feeBps) public {
    require(msg.sender == OwnableUpgradeable(pool.factory()).owner(), "Not dev");
    // Limit to maxBuyerFee
    require(feeBps <= getMaxBuyerFee() || feeBps == 10001, "Invalid fee");
    buyerDevFee = feeBps;
    emit UpdateBuyerDevFee(feeBps);
  }

  event SetOperator(address indexed operator, bool enabled);
  function setOperator(address operator, bool enabled) public onlyOwner {
    operators[operator] = enabled;
    emit SetOperator(operator, enabled);
  }

  event BuyInsurance(address indexed payer, address indexed buyer, uint256 indexed tokenId, uint256 price, uint256 tokenExpiration, bytes message);
  function buyInsurance(bytes calldata data, bytes memory message, bytes calldata signature) public {
    (bytes32 typeHash, address to, uint256 price, uint256 tokenId, uint256 tokenExpirationValue, address referral, uint256 referralPercentage, uint256 expiration, bytes32 messageHash) = abi.decode(data, (bytes32, address, uint256, uint256, uint256, address, uint256, uint256, bytes32));

    if (typeHash != BUY_TYPEHASH) revert InvalidTypeHash();
    if (keccak256(message) != messageHash) revert InvalidMessageHash();
    if (_exists(tokenId)) revert TokenIdUsed(tokenId);
    if (block.timestamp > expiration) revert Expired(expiration);

    address operator = ECDSA.recover(toTypedMessageHash(keccak256(data)), signature);

    if (!operators[operator]) revert NotOperator(operator);

    uint256 ownerFeeBps = pool.buyPercentageFee();
    uint256 buyerDevFeeBps = getBuyerDevFee();
    uint256 maxBuyerFeeBps = getMaxBuyerFee();

    // if (buyerDevFeeBps + referralPercentage > getMaxBuyerFee()) revert TooMuchFee(buyerDevFeeBps + referralPercentage);
    if (ownerFeeBps + buyerDevFeeBps + referralPercentage > maxBuyerFeeBps) {
      referralPercentage = maxBuyerFeeBps - buyerDevFee - ownerFeeBps;
    }

    {
      uint256 ownerFee = price * ownerFeeBps / 10000;
      uint256 devFee = price * buyerDevFeeBps / 10000;
      uint256 referralFee = price * referralPercentage / 10000;

      baseToken.safeTransferFrom(msg.sender, pool.owner(), ownerFee);
      baseToken.safeTransferFrom(msg.sender, OwnableUpgradeable(pool.factory()).owner(), devFee);
      baseToken.safeTransferFrom(msg.sender, referral, referralFee);
      baseToken.safeTransferFrom(msg.sender, address(pool), price - ownerFee - devFee - referralFee);
      pool.distribute(price - ownerFee - devFee - referralFee);
    }

    _mint(to, tokenId);
    tokenMessage[tokenId] = message;
    tokenExpiration[tokenId] = tokenExpirationValue;
    tokenReferralAddress[tokenId] = referral;
    tokenReferralPercentage[tokenId] = referralPercentage;

    emit BuyInsurance(msg.sender, to, tokenId, price, tokenExpirationValue, message);
  }

  event ExtendInsurance(address indexed payer, uint256 indexed tokenId, uint256 price, uint256 tokenExpiration, bytes message);
  function extendInsurance(bytes calldata data, bytes memory message, bytes calldata signature) public {
    (bytes32 typeHash, uint256 price, uint256 tokenId, uint256 nonce, uint256 tokenExpirationValue, uint256 expiration, bytes32 messageHash) = abi.decode(data, (bytes32, uint256, uint256, uint256, uint256, uint256, bytes32));

    if (typeHash != EXTEND_TYPEHASH) revert InvalidTypeHash();
    if (keccak256(message) != messageHash) revert InvalidMessageHash();
    if (!_exists(tokenId)) revert TokenNotExists(tokenId);
    if (block.timestamp > expiration) revert Expired(expiration);
    if (tokenNonce[tokenId][nonce]) revert NonceReused(nonce);

    address operator = ECDSA.recover(toTypedMessageHash(keccak256(data)), signature);

    if (!operators[operator]) revert NotOperator(operator);

    uint256 referralPercentage = tokenReferralPercentage[tokenId];

    uint256 ownerFeeBps = pool.buyPercentageFee();
    uint256 buyerDevFeeBps = getBuyerDevFee();
    uint256 maxBuyerFeeBps = getMaxBuyerFee();

    if (ownerFeeBps + buyerDevFeeBps + referralPercentage > maxBuyerFeeBps) {
      referralPercentage = maxBuyerFeeBps - buyerDevFee - ownerFeeBps;
    }

    {
      uint256 ownerFee = price * ownerFeeBps / 10000;
      uint256 devFee = price * buyerDevFeeBps / 10000;
      uint256 referralFee = price * referralPercentage / 10000;

      baseToken.safeTransferFrom(msg.sender, pool.owner(), ownerFee);
      baseToken.safeTransferFrom(msg.sender, OwnableUpgradeable(pool.factory()).owner(), devFee);
      baseToken.safeTransferFrom(msg.sender, tokenReferralAddress[tokenId], referralFee);
      baseToken.safeTransferFrom(msg.sender, address(pool), price - ownerFee - devFee - referralFee);
      pool.distribute(price - ownerFee - devFee - referralFee);
    }

    tokenMessage[tokenId] = message;
    if (tokenExpirationValue > tokenExpiration[tokenId]) {
      tokenExpiration[tokenId] = tokenExpirationValue;
    }

    tokenNonce[tokenId][nonce] = true;

    emit ExtendInsurance(msg.sender, tokenId, price, tokenExpirationValue, message);
  }

  event Claim(address indexed to, uint256 amount, bytes message);
  function claim(bytes calldata data, bytes memory message, bytes calldata signature) public {
    (bytes32 typeHash, address to, uint256 amount, uint256 tokenId, uint256 nonce, uint256 expiration, bytes32 messageHash) = abi.decode(data, (bytes32, address, uint256, uint256, uint256, uint256, bytes32));
    
    if (typeHash != CLAIM_TYPEHASH) revert InvalidTypeHash();
    if (keccak256(message) != messageHash) revert InvalidMessageHash();

    // Relax this condition in case user request for claim on last day
    // if (block.timestamp > tokenExpiration[tokenId]) revert Expired(tokenExpiration[tokenId]);

    if (block.timestamp > expiration) revert Expired(expiration);
    if (tokenNonce[tokenId][nonce]) revert NonceReused(nonce);
    
    address operator = ECDSA.recover(toTypedMessageHash(keccak256(data)), signature);
    if (!operators[operator]) revert NotOperator(operator);

    pool.claim(to, amount);
    tokenNonce[tokenId][nonce] = true;

    emit Claim(to, amount, message);
  }

  function exists(uint256 tokenId) public view returns (bool) {
    return _exists(tokenId);
  }

  /**
    * @dev Returns the name of the token.
    */
  function name() public override view virtual returns (string memory) {
    return _name;
  }

  /**
    * @dev Returns the symbol of the token, usually a shorter version of the
    * name.
    */
  function symbol() public override view virtual returns (string memory) {
    return _symbol;
  }

  function _transfer(
    address from,
    address to,
    uint256 tokenId
  ) internal virtual override {
    revert("Soulbound Token");
  }

  /**
    * @dev Base URI for computing {tokenURI}. If set, the resulting URI for each
    * token will be the concatenation of the `baseURI` and the `tokenId`. Empty
    * by default, can be overridden in child contracts.
    */
  function _baseURI() internal view virtual override returns (string memory) {
    return string.concat("https://insurance.838earth.finance/api/tokens/", Strings.toHexString(uint256(uint160(msg.sender)), 20), "/");
  }
}