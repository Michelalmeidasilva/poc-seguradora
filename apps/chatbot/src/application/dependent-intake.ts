import { z } from 'zod';

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });
const digits = (lengths: number[]) =>
  z
    .string()
    .regex(/^[\d\s().-]+$/)
    .transform((value) => value.replace(/\D/g, ''))
    .refine((value) => lengths.includes(value.length));
const schemas = {
  name: z.string().trim().min(1).max(200),
  cpf: digits([11]),
  birth: calendarDate,
  relationship: z.string().trim().min(1).max(100),
  phone: digits([10, 11]),
  biologicalSex: z.enum([
    'Feminino',
    'Masculino',
    'Prefiro não informar',
    'female',
    'male',
    'not_informed',
  ]),
};
export type DependentField = keyof typeof schemas;
export const dependentLabels: Record<DependentField, string> = {
  name: 'Nome completo',
  cpf: 'CPF do dependente',
  birth: 'Data de nascimento',
  relationship: 'Parentesco com o titular',
  phone: 'Celular do dependente',
  biologicalSex: 'Sexo biológico informado pela pessoa (ou “Prefiro não informar”)',
};

export function dependentIntake(data: Readonly<Record<string, string>> = {}) {
  const values: Record<string, string> = {};
  const missing: DependentField[] = [];
  for (const field of Object.keys(schemas) as DependentField[]) {
    const parsed = schemas[field].safeParse(
      data[field] ?? (field === 'cpf' ? data.document : undefined),
    );
    if (parsed.success) values[field] = parsed.data;
    else missing.push(field);
  }
  return { values, missing };
}

export function clearDependentDraft(data: Readonly<Record<string, string>> = {}) {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([key]) =>
        ![
          ...Object.keys(schemas),
          'document',
          'birthDate',
          'maskedDocument',
          'dependentId',
          'dependentName',
        ].includes(key),
    ),
  );
}
