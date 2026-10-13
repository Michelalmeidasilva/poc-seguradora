import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assistanceCatalog } from './assistance-catalog';
import { parseFlow } from '../../../web/src/flows/schema';
import { currentScreen, initRuntime } from '../../../web/src/flows/runtime';

// The chatbot copies are canonical; the web keeps copies for its unit tests.
const canonicalDir = new URL('./flows/', import.meta.url);
const webDir = new URL('../../../web/src/flows/fixtures/', import.meta.url);

const read = (path: string): unknown => {
  if (!existsSync(path)) throw new Error(`missing Flow JSON: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
};

describe('Flow JSON copies', () => {
  it('provides valid synchronized terminal Flows for every catalog list, form and review step', () => {
    for (const step of assistanceCatalog.steps.filter((item) => ['list', 'form', 'review'].includes(item.mode))) {
      const file = `${step.id}.flow.json`;
      const canonical = read(fileURLToPath(new URL(file, canonicalDir)));
      expect(read(fileURLToPath(new URL(file, webDir)))).toStrictEqual(canonical);
      const parsed = parseFlow(canonical);
      expect(parsed.ok, `${step.id}: ${parsed.ok ? '' : JSON.stringify(parsed.error)}`).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.value.screens[0]?.title).toBe(step.id === 'IDE-08' ? 'Informar CPF' : (step.flow as { title?: string } | undefined)?.title ?? step.title);
      expect(parsed.value.screens.some((screen) => screen.terminal)).toBe(true);
      expect(JSON.stringify(canonical)).not.toContain('data_exchange');
      expect(JSON.stringify(canonical), `${step.id} must not display unresolved catalog placeholders`).not.toMatch(/\{\{[^}]+\}\}/);
      expect(currentScreen(parsed.value, initRuntime(parsed.value)).id).toBe(parsed.value.screens[0]?.id);
      const source = step.flow as { fields?: Array<{ name: string; label: string }>; choices?: Array<{ label: string; detail: string; target: string }>; consent?: string } | undefined;
      const children = parsed.value.screens[0]?.layout.children ?? [];
      if (step.mode === 'form') {
        expect(children.filter((child) => 'name' in child).map((child) => ({ name: (child as { name: string }).name, label: (child as { label: string }).label })))
          .toEqual((source?.fields ?? []).map(({ name, label }) => ({ name, label })));
      }
      if (step.mode === 'list') {
        const choices = children.find((child) => child.type === 'RadioButtonsGroup') as { 'data-source': Array<{ title: string; description: string }> } | undefined;
        expect(choices?.['data-source'].map(({ title, description }) => ({ label: title, detail: description })))
          .toEqual(source?.choices?.map(({ label, detail }) => ({ label, detail })));
      }
      if (source?.consent) {
        expect(children).toContainEqual(expect.objectContaining({ type: 'OptIn', label: source.consent, required: true, 'init-value': false }));
      }
    }
  });
  it('preserves preference defaults while keeping consent unchecked in both synchronized copies', () => {
    const canonical = read(fileURLToPath(new URL('PRE-02.flow.json', canonicalDir))) as { screens: Array<{ layout: { children: Array<Record<string, unknown>> } }> };
    const web = read(fileURLToPath(new URL('PRE-02.flow.json', webDir))) as typeof canonical;
    const children = canonical.screens[0]!.layout.children;
    expect(children.find((child) => child.name === 'optionalDocs')?.['init-value']).toBe(true);
    expect(children.find((child) => child.name === 'optionalBenefits')?.['init-value']).toBe(false);
    expect(web).toStrictEqual(canonical);
    const consent = read(fileURLToPath(new URL('ADE-07.flow.json', canonicalDir))) as typeof canonical;
    expect(consent.screens[0]!.layout.children.find((child) => child.name === 'consent')?.['init-value']).toBe(false);
  });
  it('never binds a sensitive CPF field into the local same-Flow review', () => {
    const flow = read(fileURLToPath(new URL('DEP-05.flow.json', canonicalDir))) as { screens: Array<{ layout: { children: Array<{ type: string; text?: string }> } }> };
    const reviewText = flow.screens[1]!.layout.children.filter((child) => child.type === 'TextBody').map((child) => child.text);
    expect(reviewText).toContain('CPF: ••••');
    expect(reviewText.join('\n')).not.toContain('${form.document}');
    expect(reviewText.join('\n')).not.toContain('${form.maskedDocument}');
  });
  it('exposes only the three approved public services in discovery', () => {
    const flow = read(fileURLToPath(new URL('DES-01.flow.json', canonicalDir))) as { screens: Array<{ layout: { children: Array<{ type: string; 'data-source'?: Array<{ title: string }> }> } }> };
    const options = flow.screens[0]?.layout.children.find((child) => child.type === 'RadioButtonsGroup')?.['data-source'];
    expect(options?.map((option) => option.title)).toEqual(['Assistência Funeral', 'Assistência Farmácia', 'Telemedicina']);
  });
  it.each(['cotacao.flow.json', 'demo-componentes.flow.json'])(
    '%s is identical in the chatbot and in the web fixtures',
    (file) => {
      const canonical = fileURLToPath(new URL(file, canonicalDir));
      const web = fileURLToPath(new URL(file, webDir));
      expect(
        read(web),
        `${file} drifted: ${web} must equal the canonical ${canonical}`,
      ).toStrictEqual(read(canonical));
    },
  );
});
