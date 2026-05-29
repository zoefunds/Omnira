import { parseEther } from 'viem';
import { onchain, onchainEnabled } from './client.js';

const FUND_AMOUNT = parseEther('0.01'); // tunable

/** Fire-and-forget faucet: send dust from the service wallet to a new user's wallet. */
export async function fundUserWallet(toAddress: `0x${string}`): Promise<`0x${string}` | null> {
  if (!onchainEnabled()) return null;
  const client = onchain();
  try {
    // genlayer-js wraps viem's wallet client — sendTransaction exists.
    const hash = (await (client as any).sendTransaction({
      to: toAddress,
      value: FUND_AMOUNT,
    })) as `0x${string}`;
    return hash;
  } catch (e) {
    // Studio Net is gasless and doesn't expose eth_fillTransaction; suppress the noise.
    void 0;
    return null;
  }
}
