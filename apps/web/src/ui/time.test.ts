import { describe, expect, it } from 'vitest';
import { formatDay, formatTime, sameDay } from './time';

describe('formatTime', () => {
  it('formats an ISO timestamp as HH:mm in the given time zone', () => {
    expect(formatTime('2026-10-10T15:04:00.000Z', 'pt-BR', 'UTC')).toBe('15:04');
    expect(formatTime('2026-10-10T15:04:00.000Z', 'pt-BR', 'America/Sao_Paulo')).toBe('12:04');
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatTime('not a date')).toBe('');
  });
});

describe('formatDay', () => {
  const now = new Date('2026-10-10T15:00:00.000Z');
  it('says Hoje and Ontem', () => {
    expect(formatDay('2026-10-10T01:00:00.000Z', now, 'pt-BR', 'UTC')).toBe('Hoje');
    expect(formatDay('2026-10-09T23:59:00.000Z', now, 'pt-BR', 'UTC')).toBe('Ontem');
  });

  it('uses dd/mm/yyyy for older days', () => {
    expect(formatDay('2026-10-01T10:00:00.000Z', now, 'pt-BR', 'UTC')).toBe('01/10/2026');
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatDay('x', now)).toBe('');
  });
});

describe('sameDay', () => {
  it('compares calendar days in the given time zone', () => {
    expect(sameDay('2026-10-10T01:00:00Z', '2026-10-10T23:00:00Z', 'UTC')).toBe(true);
    expect(sameDay('2026-10-10T01:00:00Z', '2026-10-11T01:00:00Z', 'UTC')).toBe(false);
    expect(sameDay('2026-10-10T01:00:00Z', '2026-10-10T23:00:00Z', 'America/Sao_Paulo')).toBe(
      false,
    );
  });
});
