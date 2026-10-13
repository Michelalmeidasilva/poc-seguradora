import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';

// Run from the repository root: node apps/chatbot/src/domain/flows/generate.mjs
// Catalog copy/order/fields are authoritative; generated JSON is committed for both consumers.
const catalog = JSON.parse(
  readFileSync(new URL('../assistance-catalog.generated.json', import.meta.url)),
);
const root = new URL('./', import.meta.url);
const web = new URL('../../../../web/src/flows/fixtures/', import.meta.url);
const steps = catalog.groups
  .flatMap((group) => group.steps)
  .filter((step) => ['list', 'form', 'review'].includes(step.mode));
const sensitiveFields = new Set(
  steps.flatMap((step) =>
    (step.flow?.fields ?? [])
      .filter((field) => field.sensitive === true)
      .map((field) => field.name),
  ),
);

const complete = (payload = {}) => ({ name: 'complete', payload });
const ref = (name) => '${form.' + name + '}';
const isSensitiveField = (field) =>
  field.sensitive === true || /^(cpf|document)$/i.test(field.name);

function build(step) {
  const source = step.flow ?? {};
  const title = step.id === 'IDE-08' ? 'Informar CPF' : (source.title ?? step.title);
  const children = [{ type: 'TextBody', text: step.bot }];
  let payload = {};

  if (step.mode === 'list') {
    const choices = source.choices ?? [];
    children.push({
      type: 'RadioButtonsGroup',
      name: 'choice',
      label: title,
      required: true,
      'data-source': choices.map((choice, index) => ({
        id: String(index),
        title: choice.label,
        description: choice.detail,
      })),
    });
    payload = { choice: ref('choice') };
  } else if (step.mode === 'form') {
    for (const field of source.fields ?? []) {
      const common = { name: field.name, label: field.label, required: field.required === true };
      if (isSensitiveField(field)) common.sensitive = true;
      if (field.placeholder) common['helper-text'] = field.placeholder;
      if (field.value) common['init-value'] = field.value;
      if (field.type === 'checkbox') {
        children.push({ type: 'OptIn', ...common, 'init-value': field.checked === true });
      } else if (field.type === 'select') {
        children.push({
          type: 'Dropdown',
          ...common,
          'data-source': (field.choices ?? [])
            .filter((value) => value !== 'Selecione')
            .map((value) => ({ id: value, title: value })),
        });
      } else if (field.type === 'date') {
        children.push({ type: 'DatePicker', ...common });
      } else if (field.type === 'textarea') {
        children.push({ type: 'TextArea', ...common });
      } else {
        children.push({
          type: 'TextInput',
          ...common,
          'input-type': field.type === 'tel' ? 'phone' : (field.type ?? 'text'),
        });
      }
      payload[field.name] = ref(field.name);
    }
  } else {
    const reviewRefs = new Set();
    for (const section of source.sections ?? []) {
      children.push({ type: 'TextSubheading', text: section.title });
      for (const [label, value] of section.rows) {
        const dynamicValue = String(value).replace(/\{\{([A-Za-z_]\w*)\}\}/g, (_, name) => {
          const field =
            sensitiveFields.has(name) || /^(cpf|document)$/i.test(name) ? 'maskedDocument' : name;
          reviewRefs.add(field);
          return ref(field);
        });
        children.push({ type: 'TextBody', text: `${label}: ${dynamicValue}` });
      }
    }
    children.splice(
      1,
      0,
      ...[...reviewRefs].map((name) => ({ type: 'TextInput', name, label: name, visible: false })),
    );
    for (const document of source.documents ?? [])
      children.push({ type: 'TextBody', text: document });
    if (source.note) children.push({ type: 'TextCaption', text: source.note });
    if (source.consent) {
      children.push({
        type: 'OptIn',
        name: 'consent',
        label: source.consent,
        required: true,
        'init-value': false,
      });
      payload = { consent: ref('consent') };
    }
    if (source.correction) {
      children.push({
        type: 'EmbeddedLink',
        text: 'Corrigir',
        'on-click-action': complete({ correction: true }),
      });
    }
  }
  const submitLabel = step.id === 'IDE-08' ? 'Validar formato' : (source.submit ?? 'Continuar');
  if (step.mode === 'form' && step.id !== 'IDE-08' && (source.fields?.length ?? 0) > 0) {
    children.push({
      type: 'Footer',
      label: submitLabel,
      'on-click-action': {
        name: 'navigate',
        next: { type: 'screen', name: 'REVIEW' },
        payload: {},
      },
    });
    const review = [
      { type: 'TextHeading', text: 'Revise os dados' },
      ...source.fields.map((field) => ({
        type: 'TextBody',
        text: `${field.label}: ${isSensitiveField(field) ? '••••' : ref(field.name)}`,
      })),
      { type: 'Footer', label: 'Enviar formulário', 'on-click-action': complete(payload) },
    ];
    return {
      version: '7.1',
      routing_model: { FORM: ['REVIEW'], REVIEW: [] },
      screens: [
        {
          id: 'FORM',
          title,
          layout: { type: 'SingleColumnLayout', children },
          ...(source.fields.some(isSensitiveField)
            ? { sensitive: source.fields.filter(isSensitiveField).map((field) => field.name) }
            : {}),
        },
        {
          id: 'REVIEW',
          title: 'Revisar dados',
          terminal: true,
          success: true,
          ...(source.fields.some(isSensitiveField)
            ? { sensitive: source.fields.filter(isSensitiveField).map((field) => field.name) }
            : {}),
          layout: { type: 'SingleColumnLayout', children: review },
        },
      ],
    };
  }
  children.push({ type: 'Footer', label: submitLabel, 'on-click-action': complete(payload) });
  return {
    version: '7.1',
    screens: [
      {
        id: step.mode.toUpperCase(),
        title,
        terminal: true,
        success: true,
        ...(step.mode === 'form' && source.fields?.some(isSensitiveField)
          ? { sensitive: source.fields.filter(isSensitiveField).map((field) => field.name) }
          : {}),
        layout: { type: 'SingleColumnLayout', children },
      },
    ],
  };
}

for (const step of steps) {
  const name = `${step.id}.flow.json`;
  const json = `${JSON.stringify(build(step), null, 2)}\n`;
  writeFileSync(new URL(name, root), json);
  if (!process.argv.includes('--chatbot-only')) writeFileSync(new URL(name, web), json);
}

// Static imports keep JSON bundled in the chatbot; no filesystem or network read at runtime.
const previousIndex = readFileSync(new URL('index.ts', root), 'utf8');
const existingNames = new Map(
  [...previousIndex.matchAll(/import (flow\d+) from '\.\/([^']+)\.flow\.json';/g)].map((match) => [
    match[2],
    match[1],
  ]),
);
let nextIndex =
  Math.max(-1, ...[...existingNames.values()].map((name) => Number(name.slice(4)))) + 1;
const names = steps.map((step) => existingNames.get(step.id) ?? `flow${nextIndex++}`);
const imports = steps
  .map((step, i) => `import ${names[i]} from './${step.id}.flow.json';`)
  .join('\n');
const entries = steps.map((step, i) => `  '${step.id}': ${names[i]},`).join('\n');
writeFileSync(
  new URL('index.ts', root),
  `${imports}\n\nexport const assistanceFlows: Readonly<Record<string, Record<string, unknown>>> = {\n${entries}\n};\n`,
);
