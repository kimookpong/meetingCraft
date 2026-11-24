/** meetingCraft logo: speech-bubble voice mark + wordmark. Same artwork as public/logo.svg. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <defs>
        <linearGradient id="mc-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill="url(#mc-bg)" />
      <path d="M120 176c0-35.3 28.7-64 64-64h144c35.3 0 64 28.7 64 64v104c0 35.3-28.7 64-64 64H236l-66 52c-8.2 6.5-20 .6-20-9.8V344c-16.6-5-30-23.6-30-46z" fill="#fff" />
      <g fill="#2563eb">
        <rect x="178" y="210" width="26" height="64" rx="13" />
        <rect x="221" y="180" width="26" height="124" rx="13" />
        <rect x="264" y="198" width="26" height="88" rx="13" />
        <rect x="307" y="222" width="26" height="40" rx="13" />
      </g>
      <circle cx="392" cy="122" r="46" fill="#fb923c" />
      <path d="M392 96l7 17 17 7-17 7-7 17-7-17-17-7 17-7z" fill="#fff" />
    </svg>
  )
}

export function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="meetingCraft">
      <LogoMark size={size} />
      <span className="text-[19px] font-extrabold tracking-tight text-ink" style={{ fontSize: size * 0.6 }}>
        meeting<span className="text-brand-600">Craft</span>
      </span>
    </span>
  )
}
