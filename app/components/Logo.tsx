export function Logo({ compact = false }: { compact?: boolean }) {
  return <a className="brand" href="/" aria-label="Wiggle 홈"><span className="brand-mark" aria-hidden="true"><img src="/brand/logo.png" alt="" /></span>{!compact && <span>Wiggle</span>}</a>;
}
