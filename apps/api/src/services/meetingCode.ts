import crypto from 'crypto';

// Unambiguous characters for readable, typing-friendly codes (excludes 0, O, 1, I, L)
const CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateMeetingCode(): string {
  const bytes = crypto.randomBytes(8);
  let codePart1 = '';
  let codePart2 = '';

  for (let i = 0; i < 4; i++) {
    codePart1 += CHARSET[bytes[i] % CHARSET.length];
  }
  for (let i = 4; i < 8; i++) {
    codePart2 += CHARSET[bytes[i] % CHARSET.length];
  }

  return `${codePart1}-${codePart2}`;
}

export function isValidMeetingCodeFormat(code: string): boolean {
  if (!code) return false;
  const cleaned = code.trim().toUpperCase();
  const regex = /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;
  return regex.test(cleaned);
}
