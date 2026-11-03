import type { NetworkId } from '@/core/types'
import { cx } from './ui'

const bg: Record<NetworkId, string> = {
  x: 'bg-black ring-1 ring-white/15',
  linkedin: 'bg-[#0a66c2]',
  facebook: 'bg-[#1877f2]',
  instagram: 'bg-[linear-gradient(45deg,#f9ce34,#ee2a7b_50%,#6228d7)]',
  youtube: 'bg-[#ff0033]',
  twitch: 'bg-[#9146ff]',
}

function Glyph({ network }: { network: NetworkId }) {
  const common = { fill: 'none', stroke: 'white', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (network) {
    case 'x':
      return (
        <svg viewBox="0 0 24 24" className="size-[55%]">
          <path d="M5 4h4l10 16h-4z" fill="white" />
          <path d="M19 4 13.5 10.2M5 20l5.6-6.3" {...common} strokeWidth={1.8} />
        </svg>
      )
    case 'linkedin':
      return <span className="text-[0.62em] font-black tracking-tight text-white">in</span>
    case 'facebook':
      return <span className="translate-y-[0.06em] text-[0.8em] font-black text-white">f</span>
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" className="size-[60%]">
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" {...common} />
          <circle cx="12" cy="12" r="4" {...common} />
          <circle cx="17.2" cy="6.8" r="1.1" fill="white" />
        </svg>
      )
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" className="size-[58%]">
          <path d="M10 8.5v7l6-3.5z" fill="white" />
        </svg>
      )
    case 'twitch':
      return (
        <svg viewBox="0 0 24 24" className="size-[58%]">
          <path d="M5 3 3.5 7v12h4v2.5h2.5L12.5 19H16l4.5-4.5V3z" {...common} strokeWidth={1.8} />
          <path d="M11 8v4.5M15.5 8v4.5" {...common} />
        </svg>
      )
  }
}

export function NetworkIcon({ network, size = 28, className }: { network: NetworkId; size?: number; className?: string }) {
  return (
    <span
      className={cx('inline-grid shrink-0 place-items-center rounded-[28%]', bg[network], className)}
      style={{ width: size, height: size, fontSize: size }}
    >
      <Glyph network={network} />
    </span>
  )
}

export function AccountAvatar({ name, url, network, size = 36 }: { name: string; url?: string; network: NetworkId; size?: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt="" className="size-full rounded-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="grid size-full place-items-center rounded-full bg-hover text-sm font-semibold">{name.slice(0, 1).toUpperCase()}</span>
      )}
      <NetworkIcon network={network} size={Math.round(size * 0.45)} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-panel" />
    </span>
  )
}
