import { SubstrateWallet, SubstrateWalletPlatform } from '@scio-labs/use-inkathon'

/**
 * Get Polymesh Wallet definition
 * Polymesh Wallet injects itself as 'polywallet' in window.injectedWeb3
 */
export const getPolymeshWallet = (): SubstrateWallet => {
  const baseWallet: SubstrateWallet = {
    id: 'polywallet',
    name: 'Polymesh Wallet',
    platforms: [SubstrateWalletPlatform.Browser],
    urls: {
      website: 'https://polymesh.network/wallet',
      chrome:
        'https://chrome.google.com/webstore/detail/polymesh-wallet/jojhfeoedkpkglbfimdfabpdfjaoolaf',
      firefox: 'https://addons.mozilla.org/en-US/firefox/addon/polymesh-wallet/',
    },
  }

  // Attach the actual extension object if available
  if (typeof window !== 'undefined') {
    const injectedWallet = (window as any)?.injectedWeb3?.polywallet
    if (injectedWallet) {
      console.log('Attaching polywallet extension to wallet definition')
      ;(baseWallet as any).extension = injectedWallet
    }
  }

  return baseWallet
}

// Export a getter function that always returns the latest wallet state
export const polymeshWallet = getPolymeshWallet()

/**
 * Check if Polymesh Wallet is installed
 * Polymesh Wallet injects itself as 'polywallet'
 */
export const isPolymeshWalletInstalled = (): boolean => {
  if (typeof window === 'undefined') return false
  
  const injectedWeb3 = (window as any)?.injectedWeb3
  
  // Check for polywallet in injectedWeb3
  if (injectedWeb3?.polywallet) {
    return true
  }
  
  // Check in window directly
  if ((window as any)?.polywallet) {
    return true
  }
  
  return false
}
