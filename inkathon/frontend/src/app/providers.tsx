'use client'

import { PropsWithChildren, useEffect } from 'react'

import { getDeployments } from '@/deployments/deployments'
import { UseInkathonProvider } from '@scio-labs/use-inkathon'

import { polymeshTestnet, siccarDevelopment } from '@/config/chains'
import { setupPolymeshShim } from '@/utils/polymesh-shim'

export default function ClientProviders({ children }: PropsWithChildren) {
  // Set up the Polymesh Wallet shim immediately (before render)
  if (typeof window !== 'undefined') {
    setupPolymeshShim()
  }

  return (
    <UseInkathonProvider
      appName="Late Delivery & Penalty Contract"
      connectOnInit={false}
      defaultChain={polymeshTestnet}
      deployments={getDeployments()}
    >
      {children}
    </UseInkathonProvider>
  )
}
