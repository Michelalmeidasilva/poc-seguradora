import type { AssistanceDependent } from '../application/assistance-service';

/**
 * FICTITIOUS UX baseline: Familiar, one dependent (two of three slots available).
 * Catalog CON-02, DEP-10 and EXC-01; never selected by a client's CPF or session.
 * CPF and phone below are explicit demo data, not customer identity or contacts.
 */
export const canonicalInitialDependents: readonly Readonly<AssistanceDependent>[] = Object.freeze([
  Object.freeze({
    id: 'DEP-DEMO-1',
    name: 'Maria Silva',
    cpf: '12345678909',
    birthDate: '2014-03-12',
    relationship: 'Filha',
    phone: '11999999999',
    biologicalSex: 'not_informed',
  }),
]);
