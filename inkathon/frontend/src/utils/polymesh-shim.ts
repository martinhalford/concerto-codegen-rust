/**
 * Polymesh Wallet Shim
 * Makes Polymesh Wallet (polywallet) appear as polkadot-js to use-inkathon
 * This allows use-inkathon to automatically detect and connect to Polymesh Wallet
 */

export const setupPolymeshShim = () => {
  if (typeof window === 'undefined') return

  // Wait a bit for extensions to inject
  setTimeout(() => {
    const injectedWeb3 = (window as any).injectedWeb3
    
    if (!injectedWeb3) {
      console.warn('No injectedWeb3 found')
      return
    }

    // If polywallet exists but polkadot-js doesn't, create an alias
    if (injectedWeb3.polywallet && !injectedWeb3['polkadot-js']) {
      console.log('Setting up Polymesh Wallet shim: mapping polywallet → polkadot-js')
      injectedWeb3['polkadot-js'] = injectedWeb3.polywallet
      console.log('Polymesh Wallet is now accessible as polkadot-js')
    }
  }, 100)
}

