import { describe, it, expect } from 'vitest';
import { generateMeetingCode, isValidMeetingCodeFormat } from '../services/meetingCode.js';

describe('Meeting Code Service', () => {
  it('should generate meeting code with XXXX-XXXX format', () => {
    const code = generateMeetingCode();
    expect(code).toBeDefined();
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  });

  it('should validate valid meeting codes correctly', () => {
    expect(isValidMeetingCodeFormat('AB7X-K92P')).toBe(true);
    expect(isValidMeetingCodeFormat('2345-6789')).toBe(true);
    expect(isValidMeetingCodeFormat('ab7x-k92p')).toBe(true); // case-insensitive check
  });

  it('should reject invalid meeting codes', () => {
    expect(isValidMeetingCodeFormat('100001')).toBe(false);
    expect(isValidMeetingCodeFormat('AB7X-K92')).toBe(false); // too short
    expect(isValidMeetingCodeFormat('AB7X-K92PO')).toBe(false); // contains excluded 'O'
    expect(isValidMeetingCodeFormat('')).toBe(false);
  });

  it('should generate unique codes across multiple calls', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const code = generateMeetingCode();
      expect(set.has(code)).toBe(false);
      set.add(code);
    }
  });
});
