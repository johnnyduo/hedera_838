import { encodeData, getMessage } from 'eip-712';
import { Wallet, utils } from 'ethers';
import { ethers } from 'hardhat';

export interface SignatureWithPayload {
  operatorAddress: string;
  signature: string;
  payload: string;
}

function generatePayload(argsName: string[], argsType: string[], message: any): string {
  return ethers.utils.defaultAbiCoder.encode(argsType, argsName.map(name => message[name]));
}

export function randomNonce(): string {
  return Date.now().toString() + Math.floor(Math.random() * 1000).toString();
}

export async function generateSignature(privateKey: string, name: string, contractAddress: string, chainId: string | number, argsName: string[], argsType: string[], message: any): Promise<SignatureWithPayload> {
  const wallet = new Wallet(privateKey);
  const account = await wallet.getAddress();

  const EIP712Domain = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ]

  const [domainName, typeHashName] = name.split('_');

  const domain = {
    name: domainName,
    version: '1',
    chainId,
    verifyingContract: contractAddress,
  }

  const Transaction = argsName.map((name, i) => ({
    name, type: argsType[i],
  }))
  const typedData = {
    types: {
      EIP712Domain,
      [typeHashName]: Transaction,
    },
    domain,
    primaryType: typeHashName,
    message,
  }

  // Get a signable message from the typed data
  const signingKey = new utils.SigningKey(privateKey);
  const payload = encodeData(typedData, typeHashName, message);
  const typedMessage = getMessage(typedData, true);
  let signature = signingKey.signDigest(typedMessage);

  return {
    operatorAddress: account,
    signature: `${signature.r}${signature.s.substring(2)}${signature.v.toString(16).toLowerCase()}`,
    payload: "0x" + Buffer.from(payload).toString('hex'),
  }
}