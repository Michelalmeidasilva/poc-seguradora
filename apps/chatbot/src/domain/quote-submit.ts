import { err, ok, type Result } from '@seguradora/protocol';
import { z } from 'zod';
import type { QuoteRequest } from './models';

const digits = (s: string) => s.replace(/\D/g, '');
const cpf = z
  .string()
  .regex(/^[\d.\-\s]{1,20}$/)
  .transform(digits)
  .refine((d) => d.length === 11, 'invalid');
const cep = z
  .string()
  .regex(/^[\d\-\s]{1,20}$/)
  .transform(digits)
  .refine((d) => d.length === 8, 'invalid');
const reais = z.coerce.number().positive().max(1_000_000_000);

const isCalendarDate = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
};

const common = {
  nome: z.string().trim().min(3).max(100),
  cpf,
  nascimento: z.string().refine(isCalendarDate, 'invalid'),
};

const Submit = z.discriminatedUnion('produto', [
  z.object({
    produto: z.literal('AUTO'),
    ...common,
    marca: z.string().trim().min(1).max(40),
    modelo: z.string().trim().min(1).max(40),
    ano: z.coerce.number().int().min(1980).max(2100),
    cep,
  }),
  z.object({ produto: z.literal('VIDA'), ...common, capital: reais }),
]);

const toCentavos = (r: number): number => Math.round(r * 100);

/**
 * Maps the data of a completed cotacao Flow to a quote request. The error lists only the
 * names of the offending fields, never the values the user typed.
 */
export function parseQuoteSubmit(data: unknown): Result<QuoteRequest, string> {
  const r = Submit.safeParse(data);
  if (!r.success) {
    const fields = [...new Set(r.error.issues.map((i) => i.path.map(String).join('.') || 'form'))];
    return err(`invalid fields: ${fields.join(', ')}`);
  }
  const s = r.data;
  const cliente = { nome: s.nome, cpf: s.cpf, dataNascimento: s.nascimento };
  switch (s.produto) {
    case 'AUTO':
      return ok({
        produto: 'AUTO',
        cliente,
        dados: { veiculo: { marca: s.marca, modelo: s.modelo, ano: s.ano }, cep: s.cep },
        coberturas: [],
      });
    case 'VIDA':
      return ok({
        produto: 'VIDA',
        cliente,
        dados: { capitalSeguradoCentavos: toCentavos(s.capital) },
        coberturas: [],
      });
  }
}
