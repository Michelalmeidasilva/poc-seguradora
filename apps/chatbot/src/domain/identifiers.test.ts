import { describe, expect, it } from 'vitest';
import {
  CLAIM_TYPES,
  isClaimProtocol,
  isPolicyNumber,
  normalizeCpf,
  normalizeProtocol,
} from './identifiers';

describe('normalizeCpf', () => {
  it.each([
    ['12345678901', '12345678901'],
    ['123.456.789-01', '12345678901'],
    ['  123.456.789-01 ', '12345678901'],
    ['123456789-01', '12345678901'],
  ])('accepts %j', (input, expected) => {
    expect(normalizeCpf(input)).toBe(expected);
  });

  it.each([
    '',
    '123',
    '1234567890',
    '123456789012',
    'abc.def.ghi-jk',
    '123.456.789-0a',
    '12 345 678 901 extra',
  ])('rejects %j', (input) => {
    expect(normalizeCpf(input)).toBeUndefined();
  });
});

describe('policy numbers and protocols', () => {
  it.each(['AP-1001', 'AP-123', 'AP-123456'])('accepts the policy number %s', (n) => {
    expect(isPolicyNumber(n)).toBe(true);
  });

  it.each([
    'ap-1001',
    'AP-12',
    'AP-1234567',
    'AP-1001/../x',
    'AP-1001%2F',
    'AP-1001 ',
    '../AP-1001',
    '',
  ])('rejects the policy number %j', (n) => {
    expect(isPolicyNumber(n)).toBe(false);
  });

  it('normalizes protocols to upper case and rejects anything else', () => {
    expect(normalizeProtocol('sn-2001')).toBe('SN-2001');
    expect(isClaimProtocol('SN-2001')).toBe(true);
    expect(isClaimProtocol('SN-2001/x')).toBe(false);
    expect(normalizeProtocol('SN-20')).toBeUndefined();
    expect(normalizeProtocol('x SN-2001')).toBeUndefined();
  });

  it('lists the claim types offered to the user', () => {
    expect(CLAIM_TYPES).toEqual(['COLISAO', 'ROUBO', 'OUTROS']);
  });
});
