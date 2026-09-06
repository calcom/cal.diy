import { describe, it, expect } from 'vitest';
import { parseFractionalTimezoneOffset } from './fractionalTimezones';

describe('Cal.com Fractional Timezone Engine', () => {
  it('correctly parses Newfoundland GMT-03:30 (-210 minutes)', () => {
    expect(parseFractionalTimezoneOffset('GMT-03:30')).toBe(-210);
    expect(parseFractionalTimezoneOffset('GMT-3:30')).toBe(-210);
  });

  it('correctly parses Marquesas Islands GMT-09:30 (-570 minutes)', () => {
    expect(parseFractionalTimezoneOffset('GMT-09:30')).toBe(-570);
    expect(parseFractionalTimezoneOffset('GMT-9:30')).toBe(-570);
  });

  it('correctly parses India GMT+05:30 (+330 minutes) and Nepal GMT+05:45 (+345 minutes)', () => {
    expect(parseFractionalTimezoneOffset('GMT+05:30')).toBe(330);
    expect(parseFractionalTimezoneOffset('GMT+05:45')).toBe(345);
  });

  it('throws error for invalid timezone strings', () => {
    expect(() => parseFractionalTimezoneOffset('INVALID')).toThrow();
  });
});
