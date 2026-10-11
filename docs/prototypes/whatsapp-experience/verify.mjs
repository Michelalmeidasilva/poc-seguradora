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
