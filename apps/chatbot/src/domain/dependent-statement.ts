export interface ParsedDependentFields {
  name?: string;
  cpf?: string;
  birth?: string;
  relationship?: string;
  phone?: string;
  biologicalSex?: 'Feminino' | 'Masculino' | 'Prefiro não informar';
}

const cleanValue = (text: string): string =>
  text
    .trim()
    .replace(/[.,;!?]+$/, '')
    .trim();

const parseName = (text: string): string | undefined => {
  const name = cleanValue(text);
  return /^[\p{L}]+(?:[ '-][\p{L}]+)*$/u.test(name) &&
    !/^(?:(?:um|uma)\s+)?(?:pessoa|dependente|algu[eé]m)$/i.test(name)
    ? name
    : undefined;
};

const parseCpf = (text: string): string | undefined => {
  const value = cleanValue(text);
  return /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(value) ? value.replace(/\D/g, '') : undefined;
};

const parsePhone = (text: string): string | undefined => {
  const value = cleanValue(text);
  if (!/^[\d\s().-]+$/.test(value)) return undefined;
  const digits = value.replace(/\D/g, '');
  return /^\d{10,11}$/.test(digits) ? digits : undefined;
};

const parseBiologicalSex = (text: string): ParsedDependentFields['biologicalSex'] => {
  const value = cleanValue(text).toLocaleLowerCase('pt-BR');
  if (value === 'feminino' || value === 'female') return 'Feminino';
  if (value === 'masculino' || value === 'male') return 'Masculino';
  if (/^(?:prefiro n[aã]o informar|n[aã]o informado|not_informed)$/.test(value))
    return 'Prefiro não informar';
  return undefined;
};

const parseDate = (text: string): string | undefined => {
  const value = cleanValue(text);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const local = value.match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/);
  const year = iso?.[1] ?? local?.[3];
  const month = iso?.[2] ?? local?.[2];
  const day = iso?.[3] ?? local?.[1];
  if (!year || !month || !day) return undefined;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  )
    return undefined;
  return `${year}-${month}-${day}`;
};

const parseRelationship = (text: string): string | undefined => {
  const relationship = cleanValue(text).toLocaleLowerCase('pt-BR');
  return /^(?:filha|filho|c[oô]njuge|esposa|esposo|m[aã]e|pai|irm[aã]|irm[aã]o|entead[oa]|net[oa]|sobrinh[oa]|outro|outra)$/.test(
    relationship,
  )
    ? relationship
    : undefined;
};

const fieldParsers = {
  name: parseName,
  cpf: parseCpf,
  birth: parseDate,
  relationship: parseRelationship,
  phone: parsePhone,
  biologicalSex: parseBiologicalSex,
};

export function parseDependentStatement(
  text: string,
  confirmed: Readonly<ParsedDependentFields> = {},
  correcting?: keyof ParsedDependentFields,
): ParsedDependentFields {
  const parsed: ParsedDependentFields = {};
  const labels: Record<string, keyof ParsedDependentFields> = {
    nome: 'name',
    'nome completo': 'name',
    cpf: 'cpf',
    nascimento: 'birth',
    'data de nascimento': 'birth',
    parentesco: 'relationship',
    celular: 'phone',
    telefone: 'phone',
    'sexo biológico': 'biologicalSex',
    'sexo biologico': 'biologicalSex',
  };
  const labelPattern =
    'nome(?: completo)?|cpf|(?:data de )?nascimento|parentesco|celular|telefone|sexo biol[oó]gico';
  const labelled = new RegExp(
    `\\b(${labelPattern})\\s*:\\s*(.*?)(?=\\r?\\n|;|,?\\s*(?:${labelPattern})\\s*:|$)`,
    'giu',
  );
  for (const match of text.matchAll(labelled)) {
    const field = labels[match[1]!.toLocaleLowerCase('pt-BR')]!;
    const value = fieldParsers[field](match[2]!);
    if (value !== undefined) Object.assign(parsed, { [field]: value });
  }
  // Labelled answers belong to their own fields, so "Sexo biológico: filha"
  // must not accidentally become a stated relationship.
  const naturalText = text.replace(labelled, ' ');
  const cpfMatch = naturalText.match(
    /\bcpf(?:\s+(?:dele|dela))?\s*(?:(?:é|eh)\s*)?[:#-]?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/i,
  );
  if (cpfMatch) parsed.cpf = parseCpf(cpfMatch[1]!);
  const birthText =
    correcting === 'birth'
      ? naturalText.replace(/\b(?:a\s+)?data\s+correta\s+(?:é|eh)\s+/i, 'nascimento em ')
      : naturalText;
  const birthMatch = birthText.match(
    /\b(?:ele\s+nasceu\s+em|ela\s+nasceu\s+em|nascid[oa] em|nascimento(?: em)?)\s+(\d{2}[/.]\d{2}[/.]\d{4}|\d{4}-\d{2}-\d{2})\b/i,
  );
  if (birthMatch) parsed.birth = parseDate(birthMatch[1]!);
  const relation = naturalText.match(
    /\b(filha|filho|c[oô]njuge|esposa|esposo|m[aã]e|pai|outro|outra)\b/i,
  )?.[1];
  if (relation) parsed.relationship = parseRelationship(relation);
  const phoneMatch = naturalText.match(
    /\b(?:celular|telefone)(?:\s+(?:dele|dela))?\s*(?:(?:é|eh)\s*)?[:#]?\s*([\d(][\d\s().-]*\d)(?!\d)/i,
  );
  if (phoneMatch) parsed.phone = parsePhone(phoneMatch[1]!);
  const sexMatch = naturalText.match(
    /\bsexo biol[oó]gico(?:\s+(?:dele|dela))?\s*(?:(?:é|eh)\s*)?[:#]?\s*(prefiro n[aã]o informar|n[aã]o informado|not_informed|feminino|masculino|female|male)\b/i,
  );
  if (sexMatch) parsed.biologicalSex = parseBiologicalSex(sexMatch[1]!);

  if (parsed.name === undefined && correcting !== 'name') {
    const nameSource = naturalText
      .replace(/\b(?:minha\s+(?:filha|filho)|meu\s+(?:filho|dependente))\b\s*/i, '')
      .replace(/\b(?:no plano|na assist[eê]ncia)\b.*$/i, '');
    const nameMatch = nameSource.match(
      /(?:incluir|adicionar|dependente(?:\s+chamad[oa])?)\s+(.+?)(?=\s*,?\s*(?:cpf\b|nascid[oa]\b|nascimento\b|minha\s+(?:filha|filho)|meu\s+(?:filho|dependente)|filha\b|filho\b|c[oô]njuge\b|no plano\b)|[,.!?]|$)/iu,
    );
    if (nameMatch)
      parsed.name = parseName(nameMatch[1]!.replace(/^minha\s+(?:filha|filho)\s+/i, ''));
  }

  if (correcting) {
    const pureReply =
      correcting === 'name'
        ? text.trim().replace(/^(?:quero incluir|incluir|corrigir para)\s+/i, '')
        : text;
    const value = parsed[correcting] ?? fieldParsers[correcting](pureReply);
    return { ...confirmed, ...(value === undefined ? {} : { [correcting]: value }) };
  }
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined));
}
