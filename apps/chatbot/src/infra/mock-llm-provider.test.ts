import { describe, expect, it } from 'vitest';
import { MockLlmProvider } from './mock-llm-provider';

const llm = new MockLlmProvider();

describe('MockLlmProvider intents', () => {
  it.each([
    ['oi', 'greeting'],
    ['Olá, bom dia!', 'greeting'],
    ['menu', 'greeting'],
    ['ajuda', 'help'],
    ['o que você faz?', 'help'],
    ['quero fazer uma cotação do seguro auto', 'quote'],
    ['quanto custa um seguro de vida?', 'quote'],
    ['preciso simular um seguro', 'quote'],
    ['quero ver minhas apólices', 'policies'],
    ['preciso da segunda via', 'policies'],
    ['meu seguro vence quando?', 'policies'],
    ['quero abrir um sinistro', 'claim'],
    ['bati o carro ontem', 'claim'],
    ['fui roubado', 'unknown'],
    ['roubaram meu carro', 'claim'],
    ['qual o status do sinistro?', 'claim_status'],
    ['quero acompanhar meu sinistro', 'claim_status'],
    ['SN-2001', 'claim_status'],
    ['onde fica a agência mais próxima?', 'location'],
    ['cancelar', 'cancel'],
    ['voltar', 'cancel'],
    ['asdfgh', 'unknown'],
    ['', 'unknown'],
  ])('classifies %j as %s', async (text, expected) => {
    expect((await llm.classify(text)).name).toBe(expected);
  });

  it('is accent and case insensitive and matches whole words only', async () => {
    expect((await llm.classify('COTAÇÃO')).name).toBe('quote');
    expect((await llm.classify('Apólice')).name).toBe('policies');
    expect((await llm.classify('boia')).name).toBe('unknown');
    expect((await llm.classify('hoi')).name).toBe('unknown');
  });

  it('prefers a more specific intent over a greeting', async () => {
    expect((await llm.classify('boa tarde, quero uma cotação')).name).toBe('quote');
  });

  it('is deterministic', async () => {
    const a = await llm.classify('quero abrir um sinistro');
    const b = await llm.classify('quero abrir um sinistro');
    expect(a).toEqual(b);
  });
});

describe('MockLlmProvider entities', () => {
  it('extracts a cpf with or without punctuation', async () => {
    expect((await llm.classify('meu cpf é 123.456.789-01')).entities.cpf).toBe('12345678901');
    expect((await llm.classify('12345678901')).entities.cpf).toBe('12345678901');
  });

  it('does not take a longer digit string as a cpf', async () => {
    expect((await llm.classify('123456789012345')).entities.cpf).toBeUndefined();
  });

  it('extracts policy numbers and protocols in a normalized form', async () => {
    const a = await llm.classify('minha apólice ap1001');
    expect(a.entities.apolice).toBe('AP-1001');
    expect(a.name).toBe('policies');
    const p = await llm.classify('sinistro sn-2001');
    expect(p.entities.protocolo).toBe('SN-2001');
    expect(p.name).toBe('claim_status');
  });

  it('never invents entities', async () => {
    expect((await llm.classify('oi tudo bem')).entities).toEqual({});
  });
});
