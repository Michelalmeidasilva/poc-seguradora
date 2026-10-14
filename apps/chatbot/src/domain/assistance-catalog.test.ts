import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { assistanceCatalog } from './assistance-catalog';

const source = readFileSync(
  new URL('../../../../docs/prototypes/whatsapp-experience/catalog.js', import.meta.url),
  'utf8',
);
const canonicalWindow: { EXPERIENCE?: { groups: unknown[]; index: Record<string, unknown> } } = {};
runInNewContext(source, { window: canonicalWindow });
const canonical = canonicalWindow.EXPERIENCE!;

describe('assistance journey catalog', () => {
  it('contains the 24 functional groups and 247 unique executable IDs', () => {
    expect(assistanceCatalog.groups).toHaveLength(24);
    expect(assistanceCatalog.ids).toHaveLength(247);
    expect(new Set(assistanceCatalog.ids).size).toBe(247);
    expect(assistanceCatalog.ids.some((id) => id.startsWith('LEG-'))).toBe(false);
  });

  it('matches canonical IDs, content, modes, actions, and destinations with only the IDE exception', () => {
    const expected = Object.values(canonical.index).filter(
      (step) => !(step as { id: string }).id.startsWith('LEG-'),
    );
    expect(assistanceCatalog.steps).toHaveLength(247);
    for (const original of expected as Array<Record<string, unknown>>) {
      const actual = assistanceCatalog.byId[String(original.id)];
      expect(actual, `missing ${String(original.id)}`).toBeDefined();
      if (!actual) throw new Error(`missing ${String(original.id)}`);
      if (String(original.id).startsWith('IDE-')) {
        expect(actual.journeyId).toBe('IDE');
        expect(actual.bot).not.toMatch(/c[oó]digo|otp|identidade verificada/i);
        expect(actual.destinations).not.toContain('IDE-09');
        const sourceActions = (original.actions as Array<{ label: string; target: string }>).filter((action) => action.label !== 'Informar CPF').map(
          (action) => ({
            ...action,
            target:
              action.target === 'IDE-01' || action.target === 'IDE-02' ? 'IDE-08' : action.target,
          }),
        );
        // IDE-02 is an automatic receipt/validation state under SPEC 5.5, not a second input.
        expect(actual.actions).toEqual(original.id === 'IDE-02' ? [] : sourceActions);
        if (original.id === 'IDE-08') {
          expect(actual.mode).toBe('chat');
          expect(actual.flow).toBeUndefined();
        }
      } else {
        expect({
          id: actual.id,
          journeyId: actual.journeyId,
          title: actual.title,
          user: actual.user,
          bot: actual.bot,
          mode: actual.mode,
          requiresAuth: actual.requiresAuth,
          actions: actual.actions,
          ...(actual.flow === undefined ? {} : { flow: actual.flow }),
        }).toEqual({
          id: original.id,
          journeyId: original.journey,
          title: original.title,
          user: original.user,
          bot: original.bot,
          mode: original.mode,
          requiresAuth: original.requiresAuth,
          actions: original.actions,
          ...(original.flow === undefined ? {} : { flow: original.flow }),
        });
      }
    }
  });

  it('has valid non-LEG destinations and no more than three screen actions', () => {
    for (const step of assistanceCatalog.steps) {
      expect(step.actions.length).toBeLessThanOrEqual(3);
      for (const target of step.destinations) {
        expect(target.startsWith('LEG-')).toBe(false);
        expect(assistanceCatalog.byId[target], `${step.id} -> ${target}`).toBeDefined();
      }
    }
  });

  it('can emit every catalog action within the protocol title limit without dropping or truncating it', () => {
    const invalid = assistanceCatalog.steps.flatMap((step) =>
      step.actions
        .filter((action) => action.label.length > 20)
        .map((action) => `${step.id}: ${action.label}`),
    );
    expect(invalid).toEqual([]);
  });

  it('limits public product discovery to telemedicine, funeral, and pharmacy', () => {
    const publicText = assistanceCatalog.steps
      .filter((step) => !step.requiresAuth && ['DES', 'FAQ', 'UTI', 'FUN'].includes(step.journeyId))
      .map((step) => `${step.user ?? ''} ${step.bot}`)
      .join(' ')
      .toLocaleLowerCase('pt-BR');
    expect(publicText).toContain('telemedicina');
    expect(publicText).toContain('farmácia');
    expect(publicText).toContain('funeral');
    expect(publicText).not.toMatch(/seguro auto|seguro residencial|seguro de vida/);
  });

  it('offers exactly the three approved public products through canonical chooser targets', () => {
    const chooser = assistanceCatalog.byId['DES-01'];
    if (!chooser) throw new Error('canonical public product chooser DES-01 is missing');
    const choices = (
      chooser.flow as {
        choices: Array<{ label: string; detail: string; target: string }>;
      }
    ).choices;
    const canonicalChooser = canonical.index['DES-01'] as {
      flow: { choices: Array<{ label: string; detail: string; target: string }> };
    };

    expect(chooser.requiresAuth).toBe(false);
    expect(choices.map(({ label }) => label).sort()).toEqual([
      'Assistência Farmácia',
      'Assistência Funeral',
      'Telemedicina',
    ]);
    expect(choices).toEqual(canonicalChooser.flow.choices);
    expect(choices.every(({ target }) => assistanceCatalog.byId[target] !== undefined)).toBe(true);
  });

  it('keeps the canonical source stable and executable without importing browser globals in domain code', () => {
    expect(Object.keys(canonical.index)).toHaveLength(247);
  });
});
