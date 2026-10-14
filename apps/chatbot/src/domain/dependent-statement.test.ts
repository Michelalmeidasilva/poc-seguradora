import { describe, expect, it } from 'vitest';
import { parseDependentStatement, type ParsedDependentFields } from './dependent-statement';

describe('dependent statement parser', () => {
  it.each([
    ['Quero incluir minha filha.', { relationship: 'filha' }],
    ['Quero incluir um dependente', {}],
    ['Quero incluir minha filha na assistência.', { relationship: 'filha' }],
  ])('does not invent a name from the intent: %s', (statement, fields) => {
    expect(parseDependentStatement(statement)).toEqual(fields);
  });

  it('preserves a real name when the inclusion intent includes assistance context', () => {
    expect(parseDependentStatement('Quero incluir minha filha Ana Maria na assistência.')).toEqual({
      name: 'Ana Maria',
      relationship: 'filha',
    });
  });
  it('extracts all six explicitly labelled fields from a multiline form', () => {
    expect(
      parseDependentStatement(`Nome completo: João da Silva
CPF: 123.456.789-10
Data de nascimento: 12/03/2004
Parentesco: Filho
Celular: (11) 98888-7777
Sexo biológico: Prefiro não informar`),
    ).toEqual({
      name: 'João da Silva',
      cpf: '12345678910',
      birth: '2004-03-12',
      relationship: 'filho',
      phone: '11988887777',
      biologicalSex: 'Prefiro não informar',
    });
  });

  it('extracts labelled follow-up messages without re-emitting earlier fields', () => {
    expect(
      parseDependentStatement('Celular: 11 3888-7777; Sexo biológico: Feminino', {
        name: 'Alex',
        birth: '2000-02-29',
      }),
    ).toEqual({ phone: '1138887777', biologicalSex: 'Feminino' });
    expect(parseDependentStatement('Nome completo: Ana Maria; Parentesco: Sobrinha')).toEqual({
      name: 'Ana Maria',
      relationship: 'sobrinha',
    });
  });

  it('extracts explicitly stated phone and biological sex in natural language', () => {
    expect(
      parseDependentStatement('O celular dele é (11) 98888-7777 e o sexo biológico é masculino.'),
    ).toEqual({ phone: '11988887777', biologicalSex: 'Masculino' });
  });

  const confirmed: ParsedDependentFields = {
    name: 'João',
    cpf: '12345678910',
    birth: '2004-03-12',
    relationship: 'filho',
    phone: '11988887777',
    biologicalSex: 'Masculino',
  };
  it.each<[keyof ParsedDependentFields, string, string]>([
    ['name', 'João da Silva', 'João da Silva'],
    ['cpf', '111.111.111-11', '11111111111'],
    ['birth', '2000-02-29', '2000-02-29'],
    ['birth', '29/02/2000', '2000-02-29'],
    ['phone', '(21) 98888-7777', '21988887777'],
    ['relationship', 'Cônjuge', 'cônjuge'],
    ['biologicalSex', 'Feminino', 'Feminino'],
    ['biologicalSex', 'female', 'Feminino'],
    ['biologicalSex', 'male', 'Masculino'],
    ['biologicalSex', 'not_informed', 'Prefiro não informar'],
    ['biologicalSex', 'Prefiro não informar', 'Prefiro não informar'],
  ])('accepts a pure reply for requested %s: %s', (field, reply, value) => {
    expect(parseDependentStatement(reply, confirmed, field)).toEqual({
      ...confirmed,
      [field]: value,
    });
  });

  it('changes only the requested field when a reply contains several fields', () => {
    expect(
      parseDependentStatement('CPF: 111.111.111-11; Celular: (21) 98888-7777', confirmed, 'phone'),
    ).toEqual({ ...confirmed, phone: '21988887777' });
  });

  it.each(['2001-02-29', '2000-02-30', '2000-13-01', '2000-00-01', '2000-01-00'])(
    'rejects invalid ISO calendar date %s',
    (birth) => {
      expect(parseDependentStatement(`Nascimento: ${birth}`)).toEqual({});
      expect(parseDependentStatement(`nascido em ${birth}`)).toEqual({});
      expect(parseDependentStatement(birth, confirmed, 'birth')).toEqual(confirmed);
    },
  );

  it.each<[keyof ParsedDependentFields, string]>([
    ['cpf', '123456789101'],
    ['cpf', '1234'],
    ['phone', '119888877777'],
    ['phone', '1234'],
    ['biologicalSex', 'filha'],
    ['biologicalSex', 'Maria'],
    ['name', '1234'],
  ])('preserves confirmed %s when the reply is invalid: %s', (field, reply) => {
    expect(parseDependentStatement(reply, confirmed, field)).toEqual(confirmed);
  });

  it('does not treat unlabelled numbers or names as unsolicited personal data', () => {
    expect(parseDependentStatement('João da Silva 12345678910 2000-02-29 11988887777')).toEqual({});
    expect(
      parseDependentStatement('CPF: 123456789101; Celular: 119888877777; Sexo biológico: filha'),
    ).toEqual({});
  });
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
