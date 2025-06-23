'use client'

import Link from 'next/link'
import { FC, useEffect, useState } from 'react'

import { useInkathon } from '@scio-labs/use-inkathon'
import { HiOutlineExternalLink } from 'react-icons/hi'

import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

export const ChainInfo: FC = () => {
  const { api, activeChain } = useInkathon()
  const [chainInfo, setChainInfo] = useState<{ [_: string]: any }>()

  // Fetch Chain Info
  const fetchChainInfo = async () => {
    if (!api) {
      setChainInfo(undefined)
      return
    }

    const chain = (await api.rpc.system.chain())?.toString() || ''
    const version = (await api.rpc.system.version())?.toString() || ''
    const properties = ((await api.rpc.system.properties())?.toHuman() as any) || {}
    const tokenSymbol = properties?.tokenSymbol?.[0] || 'UNIT'
    const tokenDecimals = properties?.tokenDecimals?.[0] || 12
    const chainInfo = {
      Chain: chain,
      Version: version,
      Token: `${tokenSymbol} (${tokenDecimals} Decimals)`,
    }
    setChainInfo(chainInfo)
  }
  useEffect(() => {
    fetchChainInfo()
  }, [api])

  // Connection Loading Indicator
  if (!api)
    return (
      <div className="mb-4 mt-8 flex flex-col items-center justify-center space-y-3 text-center font-mono text-sm text-gray-400 sm:flex-row sm:space-x-3 sm:space-y-0">
        <Spinner />
        <div>
          Connecting to {activeChain?.name} ({activeChain?.rpcUrls?.[0]})
        </div>
      </div>
    )

  return (
    <>
      <div className="w-full">
        {/* Horizontal Status Bar */}
        <Card className="w-full">
          <CardContent className="px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
              {/* Chain Info Section */}
              <div className="flex flex-wrap items-center gap-6">
                <div className="font-mono text-gray-400">Chain Info:</div>
                {Object.entries(chainInfo || {}).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-gray-400">{key}:</span>
                    <strong className="font-mono" title={value}>
                      {value}
                    </strong>
                  </div>
                ))}
              </div>

              {/* Links Section */}
              <div className="flex items-center gap-4">
                {/* Explorer Link */}
                {!!activeChain?.explorerUrls && !!Object.keys(activeChain.explorerUrls)?.length && (
                  <Link
                    href={Object.values(activeChain.explorerUrls)[0]}
                    target="_blank"
                    className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                  >
                    Explorer <HiOutlineExternalLink />
                  </Link>
                )}
                {/* Faucet Link */}
                {!!activeChain?.faucetUrls?.length && (
                  <Link
                    href={activeChain.faucetUrls[0]}
                    target="_blank"
                    className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                  >
                    Faucet <HiOutlineExternalLink />
                  </Link>
                )}
                {/* Contracts UI Link */}
                {!!activeChain?.rpcUrls?.length && (
                  <Link
                    href={`https://contracts-ui.substrate.io/?rpc=${activeChain.rpcUrls[0]}`}
                    target="_blank"
                    className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                  >
                    Contracts UI <HiOutlineExternalLink />
                  </Link>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mainnet Security Disclaimer */}
        {!activeChain?.testnet && (
          <Card className="mt-3 border-red-300 bg-red-500/10 border-red-500/20">
            <CardContent className="px-6 py-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono text-red-400">Security Disclaimer:</span>
                <span className="text-red-300">
                  You are interacting with un-audited mainnet contracts and risk all your funds. Never transfer tokens to this contract.
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
