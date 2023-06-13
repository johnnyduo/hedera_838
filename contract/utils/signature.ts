import { generateSignature, randomNonce } from "./signatureCore";

export async function generateBuySignature(
  privateKey: string,
  contractAddress: string,
  chainId: string | number,
  to: string,
  price: string,
  tokenId: number,
  duration: number,
  referral: string,
  referralPercentage: number,
  expiration: number,
  message: string
) {
  return generateSignature(
    privateKey,
    "InsuranceNft_BuyInsurance",
    contractAddress,
    chainId,
    ["to", "price", "tokenId", "duration", "referral", "referralPercentage", "expiration", "message"],
    ["address", "uint256", "uint256", "uint256", "address", "uint256", "uint256", "bytes"],
    {
      to,
      price,
      tokenId,
      duration,
      referral,
      referralPercentage,
      expiration,
      message,
    },
  )
}

export async function generateExtendSignature(
  privateKey: string,
  contractAddress: string,
  chainId: string | number,
  price: string,
  tokenId: number,
  duration: number,
  expiration: number,
  message: string
) {
  return generateSignature(
    privateKey,
    "InsuranceNft_ExtendInsurance",
    contractAddress,
    chainId,
    ["price", "tokenId", "nonce", "duration", "expiration", "message"],
    ["uint256", "uint256", "uint256", "uint256", "uint256", "bytes"],
    {
      price,
      tokenId,
      nonce: randomNonce(),
      duration,
      expiration,
      message,
    },
  )
}

export async function generateClaimSignature(
  privateKey: string,
  contractAddress: string,
  chainId: string | number,
  to: string,
  amount: string,
  tokenId: number,
  expiration: number,
  message: string
) {
  return generateSignature(
    privateKey,
    "InsuranceNft_Claim",
    contractAddress,
    chainId,
    ["to", "amount", "tokenId", "nonce", "expiration", "message"],
    ["address", "uint256", "uint256", "uint256", "uint256", "bytes"],
    {
      to,
      amount,
      tokenId,
      nonce: randomNonce(),
      expiration,
      message,
    },
  )
}
