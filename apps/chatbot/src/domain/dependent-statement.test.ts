import { describe, expect, it } from 'vitest';
import { parseDependentStatement } from './dependent-statement';

describe('dependent statement parser', () => {
  it('parses an explicitly corrected birth date and preserves other fields', () => {
    const earlier = {
      name: 'João',
      cpf: '12345678910',
      birth: '2004-03-12',
      relationship: 'filho',
    };
    expect(parseDependentStatement('A data correta é 20/05/2012.', earlier, 'birth')).toEqual({
      ...earlier,
      birth: '2012-05-20',
    });
    expect(parseDependentStatement('A data correta é 31/02/2012.', earlier, 'birth')).toEqual(
      earlier,
    );
  });
  it('extracts only explicitly stated name, CPF, birth date, and kinship', () => {
    expect(
      parseDependentStatement(
        'Quero incluir Maria da Silva, CPF 123.456.789-00, nascida em 12/03/2014, minha filha.',
      ),
    ).toEqual({
      name: 'Maria da Silva',
      cpf: '12345678900',
      birth: '2014-03-12',
      relationship: 'filha',
    });
  });

  it('extracts the approved son statement without inferring biological sex', () => {
    expect(
      parseDependentStatement(
        'Oi, quero incluir meu filho João da Silva no plano. O CPF dele é 123.456.789-10 e ele nasceu em 12/03/2004.',
      ),
    ).toEqual({
      name: 'João da Silva',
      cpf: '12345678910',
      birth: '2004-03-12',
      relationship: 'filho',
    });
  });

  it('leaves missing, ambiguous, or malformed fields absent and never infers sex', () => {
    expect(parseDependentStatement('Quero incluir minha filha Maria.')).toEqual({
      name: 'Maria',
      relationship: 'filha',
    });
    expect(parseDependentStatement('Incluir pessoa CPF 1234 nascida em talvez.')).toEqual({});
    expect(parseDependentStatement('Quero incluir Alex, nascido em 2014.')).toEqual({
      name: 'Alex',
    });
  });

  it('repairs only the requested field and preserves all other confirmed values', () => {
    const fields = {
      name: 'Maria da Silva',
      cpf: '12345678900',
      birth: '2014-03-12',
      relationship: 'filha',
    };
    expect(parseDependentStatement('Joana', fields, 'name')).toEqual({
      name: 'Joana',
      cpf: '12345678900',
      birth: '2014-03-12',
      relationship: 'filha',
    });
  });
});
