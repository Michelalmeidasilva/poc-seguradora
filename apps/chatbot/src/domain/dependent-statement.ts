export interface ParsedDependentFields {
  name?: string;
  cpf?: string;
  birth?: string;
  relationship?: string;
}

const parseBirth = (text: string): string | undefined => {
  const match = text.match(/\b(?:nascid[oa] em|nascimento(?: em)?)\s+(\d{2})[/.](\d{2})[/.](\d{4})\b/i)
    ?? text.match(/\b(?:nascid[oa] em|nascimento(?: em)?)\s+(\d{4})-(\d{2})-(\d{2})\b/i);
  if (!match) return undefined;
  if (match[1]!.length === 4) return `${match[1]}-${match[2]}-${match[3]}`;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return undefined;
  return `${year}-${month}-${day}`;
};

export function parseDependentStatement(
  text: string,
  confirmed: Readonly<ParsedDependentFields> = {},
  correcting?: keyof ParsedDependentFields,
): ParsedDependentFields {
  const parsed: ParsedDependentFields = {};
  const cpfMatch = text.match(/(?:cpf\s*[:#-]?\s*)(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/i);
  if (cpfMatch) {
    const digits = cpfMatch[1]!.replace(/\D/g, '');
    if (digits.length === 11) parsed.cpf = digits;
  }
  parsed.birth = parseBirth(text);
  const relation = text.match(/\b(filha|filho|c[oô]njuge|esposa|esposo|m[aã]e|pai|outro|outra)\b/i)?.[1];
  if (relation) parsed.relationship = relation.toLocaleLowerCase('pt-BR');

  if (correcting === 'name') {
    const name = text.trim().replace(/^(?:quero incluir|incluir|corrigir para)\s+/i, '').replace(/[.,;!?]+$/, '');
    if (name && !/\b(?:nascid[oa]|cpf|filh[oa]|c[oô]njuge)\b/i.test(name)) parsed.name = name;
  } else {
    const nameSource = text.replace(/\bminha\s+(?:filha|filho)\s+/i, '');
    const nameMatch = nameSource.match(/(?:incluir|adicionar|dependente(?:\s+chamad[oa])?)\s+(.+?)(?=\s*,?\s*(?:cpf\b|nascid[oa]\b|nascimento\b|minha\s+(?:filha|filho)|filha\b|filho\b|c[oô]njuge\b)|[,.!?]|$)/iu);
    if (nameMatch) {
      const name = nameMatch[1]!.trim().replace(/^minha\s+(?:filha|filho)\s+/i, '');
      if (/^[\p{L}]+(?:[ '-][\p{L}]+){0,5}$/u.test(name) && !/^(?:pessoa|dependente|algu[eé]m)$/i.test(name)) parsed.name = name;
    }
  }

  if (correcting) return { ...confirmed, ...(parsed[correcting] === undefined ? {} : { [correcting]: parsed[correcting] }) };
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined));
}
