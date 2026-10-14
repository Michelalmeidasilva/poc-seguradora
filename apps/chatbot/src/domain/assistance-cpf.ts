export type AssistanceCpfError = 'invalid_format';

export type AssistanceCpfResult =
  | { ok: true; value: { normalized: string } }
  | { ok: false; error: AssistanceCpfError };

export function parseAssistanceCpf(input: string): AssistanceCpfResult {
  input = input.trim();
  if (/^[0-9]{11}$/.test(input)) return { ok: true, value: { normalized: input } };

  const canonical = /^([0-9]{3})\.([0-9]{3})\.([0-9]{3})-([0-9]{2})$/.exec(input);
  if (canonical) {
    return {
      ok: true,
      value: { normalized: `${canonical[1]}${canonical[2]}${canonical[3]}${canonical[4]}` },
    };
  }

  return { ok: false, error: 'invalid_format' };
}
