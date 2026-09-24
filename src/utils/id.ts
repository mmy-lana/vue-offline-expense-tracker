/**
 * RFC 4122 version 4 identifier generation.
 *
 * `crypto.randomUUID` is preferred when available; otherwise the generator
 * degrades to `crypto.getRandomValues` (secure) and finally to a
 * `Math.random` lane so identifier creation never throws on an exotic runtime.
 */
export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const buf = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < 16; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  }

  buf[6] = ((buf[6] ?? 0) & 0x0f) | 0x40;
  buf[8] = ((buf[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(buf, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
