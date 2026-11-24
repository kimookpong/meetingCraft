/* Flat spot illustrations (inline SVG, theme-aware via currentColor-free fills). */

const B = '#3b82f6', B2 = '#bfdbfe', B3 = '#dbeafe', O = '#fb923c', O2 = '#ffedd5', W = '#ffffff'

export function ArtRecord({ size = 148 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" aria-hidden>
      <circle cx="80" cy="80" r="72" fill={B3} />
      <rect x="40" y="44" width="80" height="58" rx="16" fill={W} stroke={B2} strokeWidth="3" />
      <path d="M58 102l-6 20 22-20" fill={W} stroke={B2} strokeWidth="3" strokeLinejoin="round" />
      <rect x="70" y="54" width="20" height="30" rx="10" fill={B} />
      <path d="M62 76a18 18 0 0 0 36 0" fill="none" stroke={B} strokeWidth="5" strokeLinecap="round" />
      <path d="M80 94v6" stroke={B} strokeWidth="5" strokeLinecap="round" />
      <path d="M126 58c6 6 6 18 0 24M134 50c11 11 11 29 0 40" fill="none" stroke={O} strokeWidth="5" strokeLinecap="round" />
      <path d="M34 58c-6 6-6 18 0 24M26 50c-11 11-11 29 0 40" fill="none" stroke={O} strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

export function ArtDocs({ size = 140 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" aria-hidden>
      <circle cx="80" cy="80" r="72" fill={O2} />
      <rect x="44" y="30" width="62" height="84" rx="10" fill={W} stroke={O} strokeWidth="3" transform="rotate(-8 75 72)" />
      <rect x="56" y="38" width="62" height="84" rx="10" fill={W} stroke={B2} strokeWidth="3" />
      <path d="M68 58h38M68 70h38M68 82h26" stroke={B2} strokeWidth="5" strokeLinecap="round" />
      <rect x="82" y="92" width="50" height="38" rx="10" fill={B} />
      <circle cx="107" cy="111" r="10" fill={W} />
      <circle cx="107" cy="111" r="5" fill={B} />
      <rect x="92" y="86" width="16" height="8" rx="3" fill={B} />
    </svg>
  )
}

export function ArtSummary({ size = 140 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" aria-hidden>
      <circle cx="80" cy="80" r="72" fill={B3} />
      <rect x="42" y="36" width="76" height="92" rx="12" fill={W} stroke={B2} strokeWidth="3" />
      <path d="M56 58h48M56 72h48M56 86h30" stroke={B2} strokeWidth="5" strokeLinecap="round" />
      <path d="M56 104l8 8 14-16" fill="none" stroke="#10b981" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M120 30l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill={O} />
      <path d="M40 108l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill={O} />
    </svg>
  )
}

export function ArtPrivate({ size = 150 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" aria-hidden>
      <circle cx="80" cy="80" r="72" fill="#d1fae5" />
      <rect x="50" y="34" width="60" height="96" rx="12" fill={W} stroke="#6ee7b7" strokeWidth="3" />
      <rect x="70" y="40" width="20" height="4" rx="2" fill="#6ee7b7" />
      <path d="M80 62l20 8v14c0 12-8 20-20 24-12-4-20-12-20-24V70z" fill="#10b981" />
      <path d="M71 86l7 7 12-14" fill="none" stroke={W} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ArtWave({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 32" aria-hidden>
      {[6, 14, 22, 10, 26, 16, 8, 20, 12, 24, 6, 14, 18, 8].map((h, i) => (
        <rect key={i} x={i * 8 + 4} y={16 - h / 2} width="4" height={h} rx="2" fill={i % 3 === 0 ? O : B} opacity={0.9} />
      ))}
    </svg>
  )
}

