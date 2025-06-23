'use client'

import { useEffect } from 'react'

import { useInkathon } from '@scio-labs/use-inkathon'
import { toast } from 'react-hot-toast'

import { HomePageTitle } from '@/app/components/home-page-title'
import { ChainInfo } from '@/components/web3/chain-info'
import { ConnectButton } from '@/components/web3/connect-button'
import { LateDeliveryContractInteractions } from '@/components/web3/late-delivery-contract-interactions'

export default function HomePage() {
  // Display `useInkathon` error messages (optional)
  const { error } = useInkathon()
  useEffect(() => {
    if (!error) return
    toast.error(error.message)
  }, [error])

  return (
    <>
      <div className="container relative flex grow flex-col py-10">
        {/* Top Bar with Title and Wallet */}
        <div className="flex items-center justify-between mb-8">
          <HomePageTitle />
          <ConnectButton />
        </div>

        <div className="flex w-full flex-col gap-6 max-w-6xl mx-auto">
          {/* Chain Metadata Information - Full Width Status Bar */}
          <ChainInfo />

          {/* Contract Interactions */}
          <div className="w-full flex justify-center">
            {/* Late Delivery & Penalty Contract Interactions */}
            <LateDeliveryContractInteractions />
          </div>
        </div>
      </div>
    </>
  )
}
