export function hasExpiredProspectingLease(
  status: string,
  leaseUntil: string | null | undefined,
  now = Date.now(),
) {
  if (status !== 'queued' && status !== 'running') return false
  if (!leaseUntil) return true

  const timestamp = Date.parse(leaseUntil)
  return !Number.isFinite(timestamp) || timestamp <= now
}
