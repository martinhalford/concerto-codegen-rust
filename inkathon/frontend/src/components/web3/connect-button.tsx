'use client'

import Image from 'next/image'
import Link from 'next/link'
import { FC, useMemo, useState } from 'react'

import { SupportedChainId } from '@azns/resolver-core'
import { useResolveAddressToDomain } from '@azns/resolver-react'
import { InjectedAccount } from '@polkadot/extension-inject/types'
import { encodeAddress } from '@polkadot/util-crypto'
import {
  SubstrateChain,
  SubstrateWalletPlatform,
  allSubstrateWallets,
  getSubstrateChain,
  isWalletInstalled,
  useBalance,
  useInkathon,
} from '@scio-labs/use-inkathon'
import { AlertOctagon } from 'lucide-react'
import aznsIconSvg from 'public/icons/azns-icon.svg'
import toast from 'react-hot-toast'
import { AiOutlineCheckCircle, AiOutlineDisconnect } from 'react-icons/ai'
import { FiChevronDown, FiExternalLink } from 'react-icons/fi'
import { RiArrowDownSLine } from 'react-icons/ri'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { polymeshTestnet } from '@/config/chains'
import { env } from '@/config/environment'
import { polymeshWallet, isPolymeshWalletInstalled } from '@/config/wallets'
import { truncateHash } from '@/utils/truncate-hash'

import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

export interface ConnectButtonProps { }
export const ConnectButton: FC<ConnectButtonProps> = () => {
  const {
    activeChain,
    switchActiveChain,
    connect,
    disconnect,
    isConnecting,
    activeAccount,
    accounts,
    setActiveAccount,
    activeWallet,
  } = useInkathon()
  const { reducibleBalance, reducibleBalanceFormatted } = useBalance(activeAccount?.address, true, {
    forceUnit: false,
    fixedDecimals: 2,
    removeTrailingZeros: true,
  })

  // Display wallet name (already set to "Polymesh Wallet" in our custom wallet definition)
  const displayWalletName = activeWallet?.name

  // Use Polymesh Testnet directly instead of mapping from env
  const [supportedChains] = useState([polymeshTestnet])

  // Always show Polymesh Wallet (detection happens when clicking)
  const [browserWallets] = useState([polymeshWallet])

  // Connect Button
  if (!activeAccount)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="h-12 min-w-[14rem] gap-2 rounded-2xl border border-white/10 bg-primary px-4 py-3 font-bold text-foreground"
            isLoading={isConnecting}
            disabled={isConnecting}
            translate="no"
          >
            Connect Polymesh Wallet
            <RiArrowDownSLine size={20} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[14rem]">
          {!activeAccount && browserWallets.length > 0 ? (
            browserWallets.map((w) => (
              <DropdownMenuItem
                key={w.id}
                className="cursor-pointer"
                onClick={async () => {
                  try {
                    console.log('=== Connecting to Polymesh Wallet ===')

                    // Use the standard polkadot-js wallet that use-inkathon knows
                    const polkadotJsWallet = allSubstrateWallets.find(wl => wl.id === 'polkadot-js')

                    if (!polkadotJsWallet) {
                      toast.error('Wallet configuration error')
                      return
                    }

                    console.log('Connecting with polkadot-js wallet definition...')

                    // Simply call connect with polkadot-js
                    // Polymesh Wallet will respond since it implements the same interface
                    await connect?.(undefined, polkadotJsWallet)

                  } catch (error) {
                    console.error('Connection error:', error)
                    toast.error(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`)
                  }
                }}
              >
                {w.name}
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem className="opacity-50">
              <Link href="https://polymesh.network/wallet" target="_blank" rel="noopener noreferrer">
                <div className="flex flex-col gap-2">
                  <div className="align-center flex justify-start gap-2">
                    <p>Install Polymesh Wallet</p>
                    <FiExternalLink size={16} />
                  </div>
                  <p className="text-xs">Click to download from polymesh.network</p>
                </div>
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )

  // Account Menu & Disconnect Button
  return (
    <div className="flex select-none flex-col items-stretch justify-center gap-2">
      {/* Wallet Name Display */}
      {displayWalletName && (
        <div className="text-center text-xs font-normal text-gray-400">
          {displayWalletName}
        </div>
      )}

      <div className="flex select-none flex-wrap items-stretch justify-center gap-4">
        {/* Account Name, Address, and AZERO.ID-Domain (if assigned) */}
        <DropdownMenu>
          <DropdownMenuTrigger
            asChild
            className="rounded-2xl bg-gray-900 px-4 py-6 font-bold text-foreground"
          >
            <Button className="min-w-[14rem] border" translate="no">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col items-center justify-center">
                  <AccountName account={activeAccount} />
                  <span className="text-xs font-normal">
                    {truncateHash(
                      encodeAddress(activeAccount.address, activeChain?.ss58Prefix || 42),
                      8,
                    )}
                  </span>
                </div>
                <FiChevronDown className="shrink-0" size={22} aria-hidden="true" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="no-scrollbar max-h-[40vh] min-w-[14rem] overflow-scroll rounded-2xl"
          >
            {/* Supported Chains */}
            {supportedChains.map((chain) => (
              <DropdownMenuItem
                disabled={chain.network === activeChain?.network}
                className={chain.network !== activeChain?.network ? 'cursor-pointer' : ''}
                key={chain.network}
                onClick={async () => {
                  await switchActiveChain?.(chain)
                  toast.success(`Switched to ${chain.name}`)
                }}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <p>{chain.name}</p>
                  {chain.network === activeChain?.network && (
                    <AiOutlineCheckCircle className="shrink-0" size={15} />
                  )}
                </div>
              </DropdownMenuItem>
            ))}

            {/* Available Accounts/Wallets */}
            <DropdownMenuSeparator />
            {(accounts || []).map((acc) => {
              const encodedAddress = encodeAddress(acc.address, activeChain?.ss58Prefix || 42)
              const truncatedEncodedAddress = truncateHash(encodedAddress, 10)

              return (
                <DropdownMenuItem
                  key={encodedAddress}
                  disabled={acc.address === activeAccount?.address}
                  className={acc.address !== activeAccount?.address ? 'cursor-pointer' : ''}
                  onClick={() => {
                    setActiveAccount?.(acc)
                  }}
                >
                  <div className="flex w-full items-center justify-between">
                    <div>
                      <AccountName account={acc} />
                      <p className="text-xs">{truncatedEncodedAddress}</p>
                    </div>
                    {acc.address === activeAccount?.address && (
                      <AiOutlineCheckCircle className="shrink-0" size={15} />
                    )}
                  </div>
                </DropdownMenuItem>
              )
            })}

            {/* Disconnect Button */}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" onClick={() => disconnect?.()}>
              <div className="flex gap-2">
                <AiOutlineDisconnect size={18} />
                Disconnect
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Account Balance */}
        {reducibleBalanceFormatted !== undefined && (
          <div className="flex min-w-[10rem] items-center justify-center gap-2 rounded-2xl border bg-gray-900 px-4 py-3 font-mono text-sm font-bold text-foreground">
            {reducibleBalanceFormatted}
            {(!reducibleBalance || reducibleBalance?.isZero()) && (
              <Tooltip>
                <TooltipTrigger className="cursor-help">
                  <AlertOctagon size={16} className="text-warning" />
                </TooltipTrigger>
                <TooltipContent>No balance to pay fees</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export interface AccountNameProps {
  account: InjectedAccount
}
export const AccountName: FC<AccountNameProps> = ({ account, ...rest }) => {
  const { activeChain } = useInkathon()
  const doResolveAddress = useMemo(
    () => Object.values(SupportedChainId).includes(activeChain?.network as SupportedChainId),
    [activeChain?.network],
  )
  const { primaryDomain } = useResolveAddressToDomain(
    doResolveAddress ? account?.address : undefined,
    { chainId: activeChain?.network },
  )

  return (
    <div className="flex items-center gap-2 font-mono text-sm font-bold uppercase" {...rest}>
      {primaryDomain || account.name}
      {!!primaryDomain && <Image src={aznsIconSvg} alt="AZERO.ID Logo" width={13} height={13} />}
    </div>
  )
}
