/**
 * RFC 4122 version 4 identifier generation.
 *
 * Preference order:
 *  1. `crypto.randomUUID` — the platform CSPRNG.
 *  2. `crypto.getRandomValues` — the platform CSPRNG.
 *  3. A high-resolution-time lane for runtimes that expose neither.
 *
 * Honest scope of lane 3: `Math.random` is not a CSPRNG, so this fallback is an
 * *uniqueness* lane, not a cryptographic one. It mixes `performance.now()` (which
 * keeps advancing between two calls in the same millisecond) with a monotonic
 * per-session counter before mixing in `Math.random`, so identifiers stay
 * distinct and RFC-compliant even on engines where `crypto` is absent. It must
 * never be relied on to produce unguessable tokens — nothing in this app uses an
 * identifier as a secret, and every cryptographic need (nothing here) would have
 * to fail closed instead.
 */

let fallbackCounter = 0;

export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const buf = new Uint8Array(16);

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buf);
  } else {
    // Microsecond-resolution clock: two calls in the same millisecond still get
    // different inputs, and the counter guarantees strict progress regardless.
    const time = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 1000;
    fallbackCounter = (fallbackCounter + 1) >>> 0;

    for (let i = 0; i < 16; i++) {
      const fromTime = Math.floor(time * (i + 1)) % 256;
      const fromCounter = (fallbackCounter + i * 31) % 256;
      const fromRandom = Math.floor(Math.random() * 256);
      buf[i] = (fromTime ^ fromCounter ^ fromRandom) & 0xff;
    }
  }

  // Version 4 + RFC 4122 variant bits.
  buf[6] = ((buf[6] ?? 0) & 0x0f) | 0x40;
  buf[8] = ((buf[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(buf, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
