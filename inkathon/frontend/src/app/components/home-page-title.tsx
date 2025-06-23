import Image from 'next/image'
import Link from 'next/link'
import { AnchorHTMLAttributes, FC } from 'react'

import githubIcon from 'public/icons/github-button.svg'
import telegramIcon from 'public/icons/telegram-button.svg'
import vercelIcon from 'public/icons/vercel-button.svg'
import inkathonLogo from 'public/images/inkathon-logo.png'

import { cn } from '@/utils/cn'

interface StyledIconLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  className?: string
}

const StyledIconLink: React.FC<StyledIconLinkProps> = ({ className, children, ...rest }) => (
  <Link
    className={cn(
      'group opacity-90 transition-all hover:-translate-y-0.5 hover:opacity-100',
      className,
    )}
    {...rest}
  >
    {children}
  </Link>
)

export const HomePageTitle: FC = () => {
  const title = 'Accord Project Test App'
  const desc = 'Test Accord Project Smart Legal Contracts deployed to Substrate.'

  return (
    <>
      <div className="flex flex-col items-start text-left font-mono">
        <h1 className="text-[2rem] font-black tracking-tighter">{title}</h1>
        {/* Tagline */}
        <p className="mt-2 text-gray-400 text-sm">{desc}</p>
      </div>
    </>
  )
}
