import { describe, expect, it } from 'vitest';
import { buildSummary } from './actions';
import cotacao from './fixtures/cotacao.flow.json';
import { parseFlow } from './schema';

describe('cotação summary', () => {
  it('masks cpf and nascimento', () => {
    const parsed = parseFlow(cotacao);
    if (!parsed.ok) throw new Error('the cotação fixture must parse');
    const payload = {
      produto: 'AUTO',
      nome: 'Maria Teste',
      cpf: '12345678909',
      nascimento: '1990-01-15',
      marca: 'Fiat',
      modelo: 'Uno',
      ano: '2015',
      cep: '01310100',
    };
    const summary = buildSummary(parsed.value, payload, payload);
    expect(summary).not.toContain('12345678909');
    expect(summary).not.toContain('1990-01-15');
    expect(summary).not.toContain('15/01/1990');
    expect(summary).toContain('••••');
    expect(summary).toContain('Maria Teste');
  });
});
