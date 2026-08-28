import { http, createConfig } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { getChainRpcUrl } from '../../../utils/blockchain';

export const config = createConfig({
  chains: [arbitrum],
  connectors: [injected()],
  transports: {
    [arbitrum.id]: http(getChainRpcUrl(arbitrum.id)),
  },
});
