export function displayedElapsedSeconds(
  elapsedSeconds: number,
  isPaused: boolean,
  receivedAt: number,
  now: number,
) {
  const recorded = Math.max(0, Math.floor(elapsedSeconds));
  if (isPaused || !receivedAt) return recorded;

  // Both now and receivedAt belong to the browser clock. Their difference is
  // safe even if that clock is ahead of or behind the server's clock.
  return recorded + Math.floor(Math.max(0, now - receivedAt) / 1000);
}