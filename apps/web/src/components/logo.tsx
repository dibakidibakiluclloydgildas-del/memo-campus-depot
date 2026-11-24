/**
 * Logo MÉMO CAMPUS — SVG vectoriel, sans dépendance externe.
 * Un « M » stylisé (Mémo) dont le dernier trait se termine par un point de
 * progression : comprendre, mémoriser, avancer.
 */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="MÉMO CAMPUS">
      <defs>
        <linearGradient id="memoGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3763f6" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#memoGradient)" />
      <path d="M13 31V17l11 8 11-8v14" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="31.5" cy="31.5" r="3.6" fill="#ffffff" />
    </svg>
  );
}
