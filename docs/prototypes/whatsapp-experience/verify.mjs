import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import assert from 'node:assert/strict';
import { URL } from 'node:url';

const root = new URL('./', import.meta.url);
const context = createContext({ window: {} });
new Script(readFileSync(new URL('catalog.js', root), 'utf8')).runInContext(context);
const { groups, index, total } = context.window.EXPERIENCE;
const ids = new Set();
for (const group of groups) {
  assert.ok(group.decision && group.rule, `${group.code}: missing decision/rule`);
  for (const step of group.steps) {
    assert.ok(!ids.has(step.id), `duplicate id: ${step.id}`);
    ids.add(step.id);
    assert.ok(step.title && step.bot && step.rule, `incomplete screen: ${step.id}`);
    assert.ok(['chat', 'list', 'form', 'review', 'document', 'audio'].includes(step.mode));
    const targets = [
      ...step.actions.map((action) => action.target),
      step.flow?.target,
      step.flow?.correction,
      ...(step.flow?.choices?.map((choice) => choice.target) || []),
    ].filter(Boolean);
    for (const target of targets)
      assert.ok(index[target], `${step.id}: unknown destination ${target}`);
    if (step.mode === 'form') assert.ok(step.flow.fields.length > 0);
    if (step.mode === 'list') assert.ok(step.flow.choices.length > 0);
    if (step.mode === 'review') assert.ok(step.flow.sections.length > 0);
    if (step.flow?.consent) assert.ok(step.mode === 'review');
  }
}
assert.equal(ids.size, total);
for (const step of Object.values(index)) assert.equal(typeof step.requiresAuth, 'boolean');
for (const id of ['DEP-33', 'CON-02', 'PAG-01', 'CAN-01', 'FUN-01', 'UTI-01', 'SOL-01', 'LEG-142'])
  assert.equal(index[id].requiresAuth, true, `${id} must require authentication`);
assert.equal(index['DES-03'].requiresAuth, false);
assert.deepEqual(
  Array.from(index['DES-01'].flow.choices.map((item) => item.label)),
  ['Assistência Funeral', 'Assistência Farmácia', 'Telemedicina'],
);
assert.deepEqual(
  Array.from(index['DES-01'].flow.choices.map((item) => item.target)),
  ['DES-12', 'DES-13', 'DES-14'],
);
for (const id of ['DES-12', 'DES-13', 'DES-14']) {
  assert.equal(index[id].mode, 'chat', `${id} must present service details in the conversation`);
  assert.equal(index[id].requiresAuth, false, `${id} is informational`);
  assert.equal(index[id].flow, undefined, `${id} should not open a native Flow`);
  assert.deepEqual(
    Array.from(index[id].actions.map((item) => item.label)),
    ['Ver opções', 'Voltar aos serviços'],
    `${id} must show conversational quick replies`,
  );
  assert.deepEqual(
    Array.from(index[id].actions.map((item) => item.target)),
    ['DES-05', 'DES-01'],
    `${id} quick replies must reach options and service discovery`,
  );
  assert.ok(index[id].actions.every((item) => item.label.length <= 20), `${id} quick replies exceed Meta button limit`);
}
assert.match(index['DES-12'].bot, /titular.*dependentes/i);
assert.match(index['DES-13'].bot, /descontos.*redes credenciadas/i);
assert.match(index['DES-14'].bot, /prestador|disponibilidade/i);
assert.ok(!groups.some((group) => group.code === 'SIN'), 'sinistro fora do escopo');
assert.ok(!/Seguro Celular|proteger um bem/i.test(JSON.stringify(groups)), 'somente assistências');
const benefits = index['UTI-01'].flow.choices.map((item) => item.label);
assert.deepEqual(Array.from(benefits), ['Telemedicina', 'Assistência Farmácia', 'Assistência Funeral']);
assert.ok(index['DEP-05'].flow.fields.some((field) => field.name === 'phone'));
assert.ok(index['DEP-05'].flow.fields.some((field) => field.name === 'biologicalSex'));
assert.ok(index['DEP-33'].actions.some((item) => item.target === 'DEP-34'));
assert.ok(index['DEP-34'].flow.fields.some((field) => field.name === 'phone'));
assert.ok(index['DEP-34'].flow.fields.some((field) => field.name === 'biologicalSex'));
assert.ok(index['DEP-34'].flow.rule.includes('não são inferidos'));
assert.ok(index['IDE-03'].bot.includes('Titular identificado'));
assert.ok(index['ENT-04'].actions.some((item) => item.target === 'FAQ-01'));
assert.deepEqual(
  Array.from(index['FAQ-01'].flow.choices.map((item) => item.label)),
  ['Informações gerais', 'Como utilizar', 'Coberturas', 'Carências'],
);
assert.ok(index['CAN-01'].actions.some((item) => item.target === 'CAN-13'));
assert.ok(index['CAN-13'].actions.some((item) => item.label === 'Prefiro não informar'));
assert.deepEqual(
  Array.from(index['CAN-13'].flow.choices.map((item) => item.label)),
  ['O valor não compensa', 'Não utilizei o benefício', 'Contratei outro serviço', 'Desisti da contratação', 'Outro motivo'],
);
assert.ok(index['NAV-01'].flow.choices.some((item) => item.target === 'FIM-01'));
assert.ok(index['FIM-01'].requiresAuth === false);
assert.ok(!index['FIM-01'].bot.includes('cancelar sua assistência'));
assert.ok(index['EXC-01'].flow.choices.every((item) => /CPF: •••\.•••\.•••-\d{2}/.test(item.detail)));
assert.ok(index['DEP-05'].flow.fields.find((field) => field.name === 'phone').required);
assert.ok(index['DEP-05'].flow.fields.find((field) => field.name === 'biologicalSex').required);
assert.ok(!index['FAQ-05'].bot.match(/\b\d+\s*(dia|mês|ano)/i));
assert.equal(groups.find((group) => group.code === 'LEG').steps.length, 34);
assert.ok(total >= 220, `expected comprehensive catalog, got ${total}`);
const html = readFileSync(new URL('index.html', root), 'utf8');
const app = readFileSync(new URL('app.js', root), 'utf8');
for (const match of app.matchAll(/\$\('([^']+)'\)/g)) {
  assert.ok(
    html.includes(`id="${match[1]}"`) || ['flow-error', 'flow-form'].includes(match[1]),
    `missing DOM element ${match[1]}`,
  );
}
new Script(app);
assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(app), 'prototype should remain offline');
const exported = readFileSync(new URL('atlas-whatsapp.html', root), 'utf8');
assert.ok(exported.includes('window.EXPERIENCE') && exported.includes('window.PROTOTYPE'));
assert.ok(
  !/<script[^>]+src=|<link[^>]+href="styles\.css"/.test(exported),
  'standalone must inline scripts and CSS',
);
const embeddedScripts = [...exported.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(embeddedScripts.length, 2);
for (const [, source] of embeddedScripts) new Script(source);
console.log(
  `Verified ${groups.length} journeys, ${total} screens, all transitions and 34 legacy screens.`,
);
