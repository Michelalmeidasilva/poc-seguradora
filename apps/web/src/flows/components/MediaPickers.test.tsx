import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useFlow } from '../FlowContext';
import { footerDisabled } from '../runtime';
import { flowOf, renderInFlow } from '../test-utils';
import { DocumentPicker, PhotoPicker } from './MediaPickers';
import { renderComponent } from './registry';

function Probe() {
  const { state, flow } = useFlow();
  return (
    <>
      <output data-testid="form">{JSON.stringify(state.form)}</output>
      <output data-testid="footer">{String(footerDisabled(flow, state))}</output>
    </>
  );
}
const form = () => JSON.parse(screen.getByTestId('form').textContent ?? '{}');
const input = (container: HTMLElement) =>
  container.querySelector('input[type="file"]') as HTMLInputElement;
// <output> in Probe also has role=status, so scope to the picker.
const live = () =>
  within(document.querySelector('[data-flow-field]') as HTMLElement).getByRole('status');
const file = (name: string, type: string, bytes = 10) =>
  new File([new Uint8Array(bytes)], name, { type });

function setup(c: Record<string, unknown>, Comp = PhotoPicker) {
  const user = userEvent.setup({ applyAccept: false });
  const r = renderInFlow(
    <>
      <Comp c={c as never} />
      <Probe />
    </>,
    flowOf([c]),
  );
  return { user, ...r };
}

describe('PhotoPicker', () => {
  const c = { type: 'PhotoPicker', name: 'fotos', label: 'Fotos do veículo' };

  it('adds files with local ids and a {media_id,file_name} payload only', async () => {
    const { user, container } = setup(c);
    await user.upload(input(container), [file('a.png', 'image/png'), file('b.jpg', 'image/jpeg')]);
    const v = form().fotos;
    expect(v).toHaveLength(2);
    expect(Object.keys(v[0]).sort()).toEqual(['file_name', 'media_id']);
    expect(v[0].media_id).toMatch(/^local-[0-9a-f-]{36}$/);
    expect(v.map((x: { file_name: string }) => x.file_name)).toEqual(['a.png', 'b.jpg']);
    expect(JSON.stringify(form())).not.toMatch(/base64|blob:|data:/);
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(live()).toHaveTextContent('a.png adicionado');
  });

  it('binds the label to the visible button and keeps the input out of tab order', () => {
    const { container } = setup(c);
    expect(screen.getByLabelText('Fotos do veículo').tagName).toBe('BUTTON');
    expect(input(container)).toHaveAttribute('tabindex', '-1');
  });

  it('removes a file via its labelled button', async () => {
    const { user, container } = setup(c);
    await user.upload(input(container), file('a.png', 'image/png'));
    await user.click(screen.getByRole('button', { name: 'Remover a.png' }));
    expect(form().fotos).toEqual([]);
    expect(live()).toHaveTextContent('a.png removido');
  });

  it('maps photo-source to accept/capture', () => {
    const cases: [string | undefined, boolean][] = [
      [undefined, false],
      ['camera_gallery', false],
      ['gallery', false],
      ['camera', true],
    ];
    for (const [src, capture] of cases) {
      const { container, unmount } = setup({ ...c, ...(src ? { 'photo-source': src } : {}) });
      expect(input(container)).toHaveAttribute('accept', 'image/*');
      expect(input(container).hasAttribute('capture')).toBe(capture);
      unmount();
    }
  });

  it('rejects oversize files with an inline error', async () => {
    const { user, container } = setup({ ...c, 'max-file-size-kb': 1 });
    await user.upload(input(container), file('big.png', 'image/png', 2048));
    expect(screen.getByText('big.png excede o limite de 1 KB')).toBeInTheDocument();
    expect(form().fotos ?? []).toEqual([]);
  });

  it('rejects non-image files', async () => {
    const { user, container } = setup(c);
    await user.upload(input(container), file('x.pdf', 'application/pdf'));
    expect(screen.getByText('x.pdf não é um tipo de arquivo permitido')).toBeInTheDocument();
    expect(form().fotos ?? []).toEqual([]);
  });

  it('stops at max-uploaded-photos', async () => {
    const { user, container } = setup({ ...c, 'max-uploaded-photos': 2 });
    await user.upload(input(container), [
      file('1.png', 'image/png'),
      file('2.png', 'image/png'),
      file('3.png', 'image/png'),
    ]);
    expect(form().fotos.map((x: { file_name: string }) => x.file_name)).toEqual(['1.png', '2.png']);
    expect(screen.getByText('Máximo de 2 arquivos')).toBeInTheDocument();
  });

  it('min-uploaded-photos blocks the footer until met', async () => {
    const { user, container } = setup({ ...c, 'min-uploaded-photos': 1 });
    expect(screen.getByTestId('footer')).toHaveTextContent('true');
    await user.upload(input(container), file('a.png', 'image/png'));
    expect(screen.getByTestId('footer')).toHaveTextContent('false');
  });

  it('shows the shared error after touch', async () => {
    const { user } = setup({ ...c, 'min-uploaded-photos': 1 });
    expect(screen.queryByText(/Envie pelo menos/)).toBeNull();
    const btn = screen.getByLabelText('Fotos do veículo');
    await user.click(btn);
    await user.tab();
    await user.tab();
    expect(screen.getByText('Envie pelo menos 1 arquivo')).toBeInTheDocument();
  });

  it('renders file names as text only', async () => {
    const { user, container } = setup(c);
    await user.upload(input(container), file('<img src=x onerror=alert(1)>.png', 'image/png'));
    expect(container.querySelector('li img')).toBeNull();
  });

  it('disables the control when enabled is false', () => {
    const { container } = setup({ ...c, enabled: false });
    expect(screen.getByLabelText('Fotos do veículo')).toBeDisabled();
    expect(input(container)).toBeDisabled();
  });
});

describe('DocumentPicker', () => {
  const c = {
    type: 'DocumentPicker',
    name: 'docs',
    label: 'Documentos',
    'allowed-mime-types': ['application/pdf'],
    'max-uploaded-documents': 1,
  };

  it('uses allowed-mime-types as accept and enforces them', async () => {
    const { user, container } = setup(c, DocumentPicker);
    expect(input(container)).toHaveAttribute('accept', 'application/pdf');
    await user.upload(input(container), file('a.png', 'image/png'));
    expect(screen.getByText('a.png não é um tipo de arquivo permitido')).toBeInTheDocument();
    await user.upload(input(container), file('a.pdf', 'application/pdf'));
    expect(form().docs).toHaveLength(1);
    expect(form().docs[0].file_name).toBe('a.pdf');
  });

  it('is registered with the host registry', () => {
    const { container } = renderInFlow(
      <>{renderComponent({ type: 'DocumentPicker', name: 'd', label: 'D' } as never, 'k')}</>,
      flowOf([]),
    );
    expect(input(container)).toBeTruthy();
    act(() => {});
  });
});
