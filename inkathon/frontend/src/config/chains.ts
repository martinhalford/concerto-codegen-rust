import { SubstrateChain } from '@scio-labs/use-inkathon'

/**
 * Siccar Development Chain Configuration
 */
export const siccarDevelopment: SubstrateChain = {
  network: 'siccar-development',
  name: 'Siccar Development',
  ss58Prefix: 42,
  rpcUrls: ['ws://127.0.0.1:9944'],
  explorerUrls: {
    polkadotjs: `https://polkadot.js.org/apps/?rpc=${encodeURIComponent('ws://127.0.0.1:9944')}/#/explorer`
  },
  testnet: true,
  faucetUrls: []
}

/**
 * Polymesh Testnet Chain Configuration
 */
export const polymeshTestnet: SubstrateChain = {
  network: 'polymesh-testnet',
  name: 'Polymesh Testnet',
  ss58Prefix: 12,
  rpcUrls: ['wss://testnet-rpc.polymesh.live/'],
  explorerUrls: {
    polkadotjs: `https://polkadot.js.org/apps/?rpc=${encodeURIComponent('wss://testnet-rpc.polymesh.live/')}/#/explorer`
  },
  testnet: true,
  faucetUrls: []
}
