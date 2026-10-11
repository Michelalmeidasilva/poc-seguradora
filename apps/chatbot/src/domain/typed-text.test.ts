import { describe, expect, it } from 'vitest';
import { claimTypeFromText, foldText, isDemoRequest, isExactCancel } from './typed-text';

describe('foldText', () => {
  it('lower-cases and removes accents', () => {
    expect(foldText('Colisão À Vista')).toBe('colisao a vista');
  });
});

describe('isExactCancel', () => {
  it.each(['cancelar', '  Cancelar ', 'CANCELAR', 'cancela', 'cáncelar'])('%j is a cancel', (t) => {
    expect(isExactCancel(t)).toBe(true);
  });

  it.each(['voltar', 'sair', 'parar', 'quero cancelar', 'cancelar o pedido', ''])(
    '%j is not',
    (t) => {
      expect(isExactCancel(t)).toBe(false);
    },
  );
});

describe('claimTypeFromText', () => {
  it.each([
    ['colisão', 'COLISAO'],
    ['Bati no muro', 'COLISAO'],
    ['foi um acidente', 'COLISAO'],
    ['Roubo', 'ROUBO'],
    ['foi um furto', 'ROUBO'],
    ['me roubaram', 'ROUBO'],
    ['assalto', 'ROUBO'],
    ['outros', 'OUTROS'],
    ['Outra coisa', 'OUTROS'],
  ] as const)('%j → %s', (text, tipo) => {
    expect(claimTypeFromText(text)).toBe(tipo);
  });

  it.each(['banana', '', 'colisaoo', 'bateria', 'bati e roubaram'])('%j → undefined', (text) => {
    expect(claimTypeFromText(text)).toBeUndefined();
  });
});

describe('isDemoRequest', () => {
  it.each(['demo', ' DEMO ', 'Démo', 'demo flow', 'Demo  Flow', '\tdemo\nflow '])(
    '%j asks for the demo',
    (t) => {
      expect(isDemoRequest(t)).toBe(true);
    },
  );

  it.each(['demonstração', 'quero a demo', 'demo flow agora', 'flow', 'demoflow', ''])(
    '%j is not',
    (t) => {
      expect(isDemoRequest(t)).toBe(false);
    },
  );
});
