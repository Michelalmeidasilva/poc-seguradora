import { describe, expect, it } from 'vitest';
import { parseAssistanceCpf } from './assistance-cpf';

describe('parseAssistanceCpf', () => {
  it.each([
    ['any 11 ASCII digits', '12345678900', '12345678900'],
    ['eleven zeroes', '00000000000', '00000000000'],
    ['canonical punctuation', '123.456.789-00', '12345678900'],
    ['trimmed message', ' \t123.456.789-00\n ', '12345678900'],
  ])('accepts %s and returns digits only', (_description, input, normalized) => {
    expect(parseAssistanceCpf(input)).toEqual({ ok: true, value: { normalized } });
  });

  it.each([
    ['10 digits', '1234567890'],
    ['12 digits', '123456789012'],
    ['partial punctuation', '123.456789-00'],
    ['letters', '1234567890a'],
    ['an internal space', '123 45678900'],
    ['duplicated punctuation', '123..456.789-00'],
    ['non-ASCII digits', '１２３４５６７８９００'],
    ['embedded CPF', 'meu CPF 12345678900'],
    ['trailing text', '12345678900 obrigado'],
  ])('rejects %s with the stable format error', (_description, input) => {
    expect(parseAssistanceCpf(input)).toEqual({ ok: false, error: 'invalid_format' });
  });
});
