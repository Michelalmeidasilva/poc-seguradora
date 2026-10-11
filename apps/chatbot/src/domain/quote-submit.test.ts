import { describe, expect, it } from 'vitest';
import { parseQuoteSubmit } from './quote-submit';

const base = { nome: 'Maria Souza', cpf: '123.456.789-01', nascimento: '1990-05-20' };

describe('parseQuoteSubmit', () => {
  it('maps an AUTO submission, normalizing the cpf and cep and converting the year', () => {
    const r = parseQuoteSubmit({
      ...base,
      produto: 'AUTO',
      marca: 'Fiat',
      modelo: 'Argo',
      ano: '2021',
      cep: '01310-100',
    });
    expect(r).toEqual({
      ok: true,
      value: {
        produto: 'AUTO',
        cliente: { nome: 'Maria Souza', cpf: '12345678901', dataNascimento: '1990-05-20' },
        dados: { veiculo: { marca: 'Fiat', modelo: 'Argo', ano: 2021 }, cep: '01310100' },
        coberturas: [],
      },
    });
  });

  it('converts RESIDENCIAL values from reais to centavos', () => {
    const r = parseQuoteSubmit({
      ...base,
      produto: 'RESIDENCIAL',
      cep: '01310100',
      tipoImovel: 'APARTAMENTO',
      valorImovel: '350000',
    });
    expect(r.ok && r.value.dados).toEqual({
      cep: '01310100',
      tipoImovel: 'APARTAMENTO',
      valorImovelCentavos: 35000000,
    });
  });

  it('maps VIDA with the insured capital in centavos', () => {
    const r = parseQuoteSubmit({ ...base, produto: 'VIDA', capital: 200000 });
    expect(r.ok && r.value.dados).toEqual({ capitalSeguradoCentavos: 20000000 });
  });

  it.each([
    ['unknown product', { ...base, produto: 'PET' }],
    ['missing product', { ...base }],
    ['short cpf', { ...base, cpf: '123', produto: 'VIDA', capital: '1000' }],
    ['bad birth date', { ...base, nascimento: '20/05/1990', produto: 'VIDA', capital: '1000' }],
    ['empty name', { ...base, nome: '  ', produto: 'VIDA', capital: '1000' }],
    ['non numeric capital', { ...base, produto: 'VIDA', capital: 'muito' }],
    ['negative capital', { ...base, produto: 'VIDA', capital: '-5' }],
    ['absurd capital', { ...base, produto: 'VIDA', capital: '1e12' }],
    [
      'absurd year',
      { ...base, produto: 'AUTO', marca: 'F', modelo: 'A', ano: '1500', cep: '01310100' },
    ],
    ['bad cep', { ...base, produto: 'AUTO', marca: 'F', modelo: 'A', ano: '2020', cep: '123' }],
    [
      'cpf with trailing letters',
      { ...base, cpf: '12345678901abc', produto: 'VIDA', capital: '1000' },
    ],
    [
      'cpf with interleaved letters',
      { ...base, cpf: '1a2b3c4d5e6', produto: 'VIDA', capital: '1000' },
    ],
    [
      'cep with a letter',
      { ...base, produto: 'AUTO', marca: 'F', modelo: 'A', ano: '2020', cep: '01310-10a' },
    ],
    [
      'impossible calendar date',
      { ...base, nascimento: '2026-02-30', produto: 'VIDA', capital: '1000' },
    ],
    [
      'nonsense calendar date',
      { ...base, nascimento: '9999-99-99', produto: 'VIDA', capital: '1000' },
    ],
    ['not an object', 'texto'],
    ['null', null],
  ])('rejects %s', (_name, input) => {
    expect(parseQuoteSubmit(input).ok).toBe(false);
  });

  it('reports field names but never the values that were sent', () => {
    const r = parseQuoteSubmit({
      ...base,
      nome: 'SEGREDO-XYZ',
      cpf: '999',
      produto: 'VIDA',
      capital: '1000',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('cpf');
    expect(r.error).not.toContain('SEGREDO-XYZ');
    expect(r.error).not.toContain('999');
  });

  it('ignores unknown keys, including prototype pollution attempts', () => {
    const payload = JSON.parse(
      '{"produto":"VIDA","nome":"Maria Souza","cpf":"12345678901","nascimento":"1990-05-20","capital":"1000","__proto__":{"admin":true},"constructor":{"x":1}}',
    ) as unknown;
    const r = parseQuoteSubmit(payload);
    expect(r.ok).toBe(true);
    expect(({} as { admin?: boolean }).admin).toBeUndefined();
    expect(r.ok && Object.keys(r.value)).toEqual(['produto', 'cliente', 'dados', 'coberturas']);
    expect(r.ok && JSON.stringify(r.value)).not.toContain('admin');
    expect(r.ok && Object.keys(r.value.cliente).sort()).toEqual(['cpf', 'dataNascimento', 'nome']);
  });
});
