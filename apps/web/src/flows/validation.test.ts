import { describe, expect, it } from 'vitest';
import type { FlowComponent } from './schema';
import { validateField } from './validation';

const input = (extra: Record<string, unknown> = {}): FlowComponent =>
  ({ type: 'TextInput', name: 'f', label: 'F', ...extra }) as FlowComponent;

describe('validateField: required', () => {
  it('flags empty values only when required', () => {
    const c = input({ required: true });
    for (const empty of [undefined, null, '', '   ']) {
      expect(validateField(c, empty)).toBe('Campo obrigatório');
    }
    expect(validateField(c, 'Ana')).toBeUndefined();
    expect(validateField(input(), '')).toBeUndefined();
    expect(validateField(input(), undefined)).toBeUndefined();
  });

  it('skips the other rules for an empty optional field', () => {
    expect(validateField(input({ 'min-chars': 3, 'input-type': 'email' }), '')).toBeUndefined();
  });
});

describe('validateField: chars', () => {
  it('min-chars', () => {
    const c = input({ 'min-chars': 3 });
    expect(validateField(c, 'ab')).toBe('Mínimo de 3 caracteres');
    expect(validateField(c, 'abc')).toBeUndefined();
  });

  it('max-chars', () => {
    const c = input({ 'max-chars': '4' });
    expect(validateField(c, 'abcde')).toBe('Máximo de 4 caracteres');
    expect(validateField(c, 'abcd')).toBeUndefined();
  });

  it('applies to TextArea', () => {
    const c = { type: 'TextArea', name: 'f', label: 'F', 'max-chars': 2 } as FlowComponent;
    expect(validateField(c, 'abc')).toBe('Máximo de 2 caracteres');
  });

  it('uses singular for 1', () => {
    expect(validateField(input({ 'min-chars': 1, 'max-chars': 1 }), 'ab')).toBe(
      'Máximo de 1 caractere',
    );
  });
});

describe('validateField: input-type', () => {
  const cases: [string, unknown, unknown, string][] = [
    ['number', '2020', 'abc', 'Informe um número'],
    ['number', '-1.5', '1.2.3', 'Informe um número'],
    ['email', 'ana@example.com', 'ana@', 'Informe um e-mail válido'],
    ['phone', '+55 (11) 98765-4321', '12ab', 'Informe um telefone válido'],
    ['passcode', '1234', '12a4', 'Use apenas números'],
  ];
  it.each(cases)('%s accepts %j and rejects %j', (type, ok, bad, msg) => {
    const c = input({ 'input-type': type });
    expect(validateField(c, ok)).toBeUndefined();
    expect(validateField(c, bad)).toBe(msg);
  });

  it('text and password accept anything', () => {
    expect(validateField(input({ 'input-type': 'text' }), '@@ 12')).toBeUndefined();
    expect(validateField(input({ 'input-type': 'password' }), 'x y!')).toBeUndefined();
  });

  it('does not support pattern', () => {
    expect(validateField(input({ pattern: '^a$' }), 'b')).toBeUndefined();
  });

  it('rejects a non-string value for a text field', () => {
    expect(validateField(input(), { a: 1 })).toBe('Valor inválido');
  });
});

describe('validateField: error-message', () => {
  it('overrides the default text when a rule fails', () => {
    const c = input({ required: true, 'min-chars': 11, 'error-message': 'CPF inválido' });
    expect(validateField(c, '')).toBe('CPF inválido');
    expect(validateField(c, '123')).toBe('CPF inválido');
    expect(validateField(c, '12345678901')).toBeUndefined();
  });

  it('ignores an unresolved dynamic error-message', () => {
    const c = input({ required: true, 'error-message': '${data.err}' });
    expect(validateField(c, '')).toBe('Campo obrigatório');
  });

  it('helper-text is display only', () => {
    expect(validateField(input({ 'helper-text': 'Somente números' }), 'abc')).toBeUndefined();
  });
});

describe('validateField: CheckboxGroup', () => {
  const group = (extra: Record<string, unknown>): FlowComponent =>
    ({
      type: 'CheckboxGroup',
      name: 'g',
      label: 'G',
      'data-source': [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' },
      ],
      ...extra,
    }) as FlowComponent;

  it('required', () => {
    expect(validateField(group({ required: true }), [])).toBe('Campo obrigatório');
    expect(validateField(group({ required: true }), ['a'])).toBeUndefined();
  });

  it('min-selected-items', () => {
    const c = group({ 'min-selected-items': 2 });
    expect(validateField(c, ['a'])).toBe('Selecione pelo menos 2 opções');
    expect(validateField(c, ['a', 'b'])).toBeUndefined();
  });

  it('max-selected-items', () => {
    const c = group({ 'max-selected-items': 1 });
    expect(validateField(c, ['a', 'b'])).toBe('Selecione no máximo 1 opção');
    expect(validateField(c, ['a'])).toBeUndefined();
  });

  it('rejects a non-array value', () => {
    expect(validateField(group({}), 'a')).toBe('Valor inválido');
  });
});

describe('validateField: DatePicker', () => {
  const date = (extra: Record<string, unknown>): FlowComponent =>
    ({ type: 'DatePicker', name: 'd', label: 'D', ...extra }) as FlowComponent;

  it('min-date', () => {
    const c = date({ 'min-date': '2024-01-10' });
    expect(validateField(c, '2024-01-09')).toBe('A data deve ser a partir de 10/01/2024');
    expect(validateField(c, '2024-01-10')).toBeUndefined();
  });

  it('max-date', () => {
    const c = date({ 'max-date': '2024-01-10' });
    expect(validateField(c, '2024-01-11')).toBe('A data deve ser até 10/01/2024');
    expect(validateField(c, '2024-01-10')).toBeUndefined();
  });

  it('accepts a millisecond timestamp bound (older Flow JSON)', () => {
    const c = date({ 'min-date': String(Date.UTC(2024, 0, 10)) });
    expect(validateField(c, '2024-01-09')).toBe('A data deve ser a partir de 10/01/2024');
  });

  it('rejects a malformed date', () => {
    expect(validateField(date({}), '2024-02-30')).toBe('Data inválida');
    expect(validateField(date({}), '10/01/2024')).toBe('Data inválida');
  });

  it('required', () => {
    expect(validateField(date({ required: true }), '')).toBe('Campo obrigatório');
  });
});

describe('validateField: CalendarPicker range', () => {
  const cal = { type: 'CalendarPicker', name: 'r', mode: 'range', required: true } as FlowComponent;

  it('needs both ends', () => {
    expect(validateField(cal, { 'start-date': '2024-01-01' })).toBe('Campo obrigatório');
  });

  it('end before start', () => {
    expect(validateField(cal, { 'start-date': '2024-01-05', 'end-date': '2024-01-01' })).toBe(
      'A data final deve ser igual ou posterior à inicial',
    );
    expect(
      validateField(cal, { 'start-date': '2024-01-01', 'end-date': '2024-01-05' }),
    ).toBeUndefined();
  });
});

describe('validateField: OptIn', () => {
  const opt = (required: boolean) =>
    ({ type: 'OptIn', name: 'o', label: 'Aceito', required }) as FlowComponent;

  it('required means checked', () => {
    expect(validateField(opt(true), false)).toBe('Campo obrigatório');
    expect(validateField(opt(true), undefined)).toBe('Campo obrigatório');
    expect(validateField(opt(true), true)).toBeUndefined();
    expect(validateField(opt(false), false)).toBeUndefined();
  });
});

describe('validateField: pickers', () => {
  const file = { media_id: 'local-1', file_name: 'a.jpg' };

  it('min/max-uploaded-photos', () => {
    const c = {
      type: 'PhotoPicker',
      name: 'p',
      'min-uploaded-photos': 1,
      'max-uploaded-photos': 2,
    } as FlowComponent;
    expect(validateField(c, [])).toBe('Envie pelo menos 1 arquivo');
    expect(validateField(c, undefined)).toBe('Envie pelo menos 1 arquivo');
    expect(validateField(c, [file])).toBeUndefined();
    expect(validateField(c, [file, file, file])).toBe('Envie no máximo 2 arquivos');
  });

  it('min/max-uploaded-documents', () => {
    const c = {
      type: 'DocumentPicker',
      name: 'd',
      'min-uploaded-documents': 2,
    } as FlowComponent;
    expect(validateField(c, [file])).toBe('Envie pelo menos 2 arquivos');
    expect(validateField(c, [file, file])).toBeUndefined();
  });

  it('min 0 is optional', () => {
    const c = { type: 'PhotoPicker', name: 'p', 'min-uploaded-photos': 0 } as FlowComponent;
    expect(validateField(c, [])).toBeUndefined();
  });
});

describe('validateField: non-fields', () => {
  it('returns undefined for components without a name', () => {
    expect(validateField({ type: 'TextBody', text: 'x' } as FlowComponent, '')).toBeUndefined();
    expect(validateField({ type: 'Mystery' }, '')).toBeUndefined();
  });
});
