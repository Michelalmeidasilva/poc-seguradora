import { hasDynamicValue } from './expr';
import type { FlowComponent } from './schema';

const REQUIRED = 'Campo obrigatório';
const INVALID = 'Valor inválido';

const FORMAT_RULES: Record<string, { test: RegExp; message: string }> = {
  number: { test: /^-?\d+([.,]\d+)?$/, message: 'Informe um número' },
  email: { test: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Informe um e-mail válido' },
  phone: { test: /^\+?[\d\s().-]+$/, message: 'Informe um telefone válido' },
  passcode: { test: /^\d+$/, message: 'Use apenas números' },
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const prop = (c: FlowComponent, key: string): unknown =>
  Object.hasOwn(c, key) ? (c as Record<string, unknown>)[key] : undefined;

/** Non-negative integer from a number or numeric string. */
const count = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : undefined;
};

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** `YYYY-MM-DD` that names a real calendar day. */
export const isoDate = (v: unknown): string | undefined => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
    ? v
    : undefined;
};

/** Date bound: `YYYY-MM-DD`, or a millisecond timestamp string (older Flow JSON). */
export const dateBound = (v: unknown): string | undefined => {
  if (typeof v === 'string' && /^\d{1,15}$/.test(v)) {
    const t = new Date(Number(v));
    return Number.isNaN(t.getTime()) ? undefined : t.toISOString().slice(0, 10);
  }
  return isoDate(v);
};

const br = (iso: string): string => iso.split('-').reverse().join('/');

const isBlank = (v: unknown): boolean =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();
const DAY_MS = 86_400_000;

function checkDate(c: FlowComponent, value: string): string | undefined {
  const date = isoDate(value);
  if (!date) return 'Data inválida';
  const min = dateBound(prop(c, 'min-date'));
  const max = dateBound(prop(c, 'max-date'));
  if (min && date < min) return `A data deve ser a partir de ${br(min)}`;
  if (max && date > max) return `A data deve ser até ${br(max)}`;
  const unavailable = prop(c, 'unavailable-dates');
  if (Array.isArray(unavailable) && unavailable.some((u) => dateBound(u) === date))
    return 'Data indisponível';
  const days = prop(c, 'include-days');
  if (Array.isArray(days) && days.length > 0 && !days.includes(WEEKDAYS[weekday(date)]))
    return 'Dia da semana indisponível';
  return undefined;
}

function checkText(c: FlowComponent, value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return INVALID;
  const text = String(value);
  const min = count(prop(c, 'min-chars'));
  const max = count(prop(c, 'max-chars'));
  if (min !== undefined && text.length < min)
    return `Mínimo de ${plural(min, 'caractere', 'caracteres')}`;
  if (max !== undefined && text.length > max)
    return `Máximo de ${plural(max, 'caractere', 'caracteres')}`;
  const type = prop(c, 'input-type');
  const rule =
    typeof type === 'string' && Object.hasOwn(FORMAT_RULES, type) ? FORMAT_RULES[type] : undefined;
  if (rule && !rule.test.test(text.trim())) return rule.message;
  if (type === 'phone') {
    const digits = text.replace(/\D/g, '').length;
    if (digits < 8 || digits > 15) return FORMAT_RULES.phone!.message;
  }
  return undefined;
}

function checkSelection(c: FlowComponent, value: unknown, required: boolean): string | undefined {
  const list = value === undefined || value === null ? [] : value;
  if (!Array.isArray(list) || list.some((v) => typeof v !== 'string')) return INVALID;
  if (list.length === 0) return required ? REQUIRED : undefined;
  const min = count(prop(c, 'min-selected-items'));
  const max = count(prop(c, 'max-selected-items'));
  if (min !== undefined && list.length < min)
    return `Selecione pelo menos ${plural(min, 'opção', 'opções')}`;
  if (max !== undefined && list.length > max)
    return `Selecione no máximo ${plural(max, 'opção', 'opções')}`;
  return undefined;
}

function checkUploads(c: FlowComponent, value: unknown, kind: string): string | undefined {
  const list = value === undefined || value === null ? [] : value;
  if (!Array.isArray(list)) return INVALID;
  const min = count(prop(c, `min-uploaded-${kind}`)) ?? (prop(c, 'required') === true ? 1 : 0);
  const max = count(prop(c, `max-uploaded-${kind}`));
  if (list.length < min) return `Envie pelo menos ${plural(min, 'arquivo', 'arquivos')}`;
  if (max !== undefined && list.length > max)
    return `Envie no máximo ${plural(max, 'arquivo', 'arquivos')}`;
  return undefined;
}

function checkRange(c: FlowComponent, value: unknown, required: boolean): string | undefined {
  if (value === undefined || value === null) return required ? REQUIRED : undefined;
  if (!isRecord(value)) return INVALID;
  const start = Object.hasOwn(value, 'start-date') ? value['start-date'] : undefined;
  const end = Object.hasOwn(value, 'end-date') ? value['end-date'] : undefined;
  if (isBlank(start) && isBlank(end)) return required ? REQUIRED : undefined;
  if (isBlank(start) || isBlank(end)) return required ? REQUIRED : 'Informe as duas datas';
  const a = checkDate(c, start as string) ?? checkDate(c, end as string);
  if (a) return a;
  if ((end as string) < (start as string))
    return 'A data final deve ser igual ou posterior à inicial';
  const span =
    (Date.parse(`${end as string}T00:00:00Z`) - Date.parse(`${start as string}T00:00:00Z`)) /
      DAY_MS +
    1;
  const min = count(prop(c, 'min-days'));
  const max = count(prop(c, 'max-days'));
  if (min !== undefined && span < min) return `Selecione pelo menos ${plural(min, 'dia', 'dias')}`;
  if (max !== undefined && span > max) return `Selecione no máximo ${plural(max, 'dia', 'dias')}`;
  return undefined;
}

function check(c: FlowComponent, value: unknown): string | undefined {
  const required = prop(c, 'required') === true;
  switch (c.type) {
    case 'PhotoPicker':
      return checkUploads(c, value, 'photos');
    case 'DocumentPicker':
      return checkUploads(c, value, 'documents');
    case 'CheckboxGroup':
    case 'ChipsSelector':
      return checkSelection(c, value, required);
    case 'OptIn':
      return required && value !== true ? REQUIRED : undefined;
    case 'CalendarPicker':
      if (prop(c, 'mode') === 'range') return checkRange(c, value, required);
      break;
  }
  if (isBlank(value)) return required ? REQUIRED : undefined;
  switch (c.type) {
    case 'TextInput':
    case 'TextArea':
      return checkText(c, value);
    case 'DatePicker':
    case 'CalendarPicker':
      return typeof value === 'string' ? checkDate(c, value) : INVALID;
    case 'RadioButtonsGroup':
    case 'Dropdown': {
      if (typeof value !== 'string') return INVALID;
      const source = prop(c, 'data-source');
      if (!Array.isArray(source)) return undefined;
      const known = source.some((o) => isRecord(o) && o.id === value && o.enabled !== false);
      return known ? undefined : 'Opção inválida';
    }
    default:
      return undefined;
  }
}

/** pt-BR error for `value`, or undefined when valid. A literal `error-message` overrides it. */
export function validateField(c: FlowComponent, value: unknown): string | undefined {
  try {
    if (!isRecord(c) || typeof prop(c, 'name') !== 'string') return undefined;
    const error = check(c, value);
    if (error === undefined) return undefined;
    const custom = prop(c, 'error-message');
    return typeof custom === 'string' && custom.trim() !== '' && !hasDynamicValue(custom)
      ? custom
      : error;
  } catch {
    return INVALID;
  }
}
