import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { flowOf, renderInFlow } from '../test-utils';
import { RichText, TextBody, TextCaption, TextHeading, TextSubheading } from './text';

const flow = flowOf([]);
const scoped = { data: { name: 'Ana' } };

describe('text components', () => {
  it('interpolate ${...} in every text component', () => {
    renderInFlow(
      <>
        <TextHeading c={{ type: 'TextHeading', text: 'H ${data.name}' }} />
        <TextSubheading c={{ type: 'TextSubheading', text: 'S ${data.name}' }} />
        <TextBody c={{ type: 'TextBody', text: 'B ${data.name}' }} />
        <TextCaption c={{ type: 'TextCaption', text: 'C ${data.name}' }} />
        <RichText c={{ type: 'RichText', text: ['R ${data.name}'] }} />
      </>,
      flow,
      scoped,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'H Ana' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'S Ana' })).toBeInTheDocument();
    expect(screen.getByText('B Ana')).toBeInTheDocument();
    expect(screen.getByText('C Ana')).toBeInTheDocument();
    expect(screen.getByText('R Ana')).toBeInTheDocument();
  });

  it('TextBody applies font-weight, strikethrough and inline markdown', () => {
    const { container } = renderInFlow(
      <TextBody
        c={
          {
            type: 'TextBody',
            text: '*b* _i_ ~s~',
            'font-weight': 'bold',
            strikethrough: true,
          } as never
        }
      />,
      flow,
    );
    const p = container.querySelector('p')!;
    expect(p).toHaveClass('flow-body--bold', 'flow-body--strike');
    expect(p.querySelector('strong')).toHaveTextContent('b');
    expect(p.querySelector('em')).toHaveTextContent('i');
    expect(p.querySelector('del')).toHaveTextContent('s');
  });

  it('RichText renders headings, lists and safe links', () => {
    const { container } = renderInFlow(
      <RichText
        c={{
          type: 'RichText',
          text: ['# Title', '- one', '- *two*', '1. first', '[ok](https://exemplo.com/a)'],
        }}
      />,
      flow,
    );
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelector('ul strong')).toHaveTextContent('two');
    expect(container.querySelectorAll('ol li')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'ok' })).toHaveAttribute(
      'href',
      'https://exemplo.com/a',
    );
  });

  it('RichText renders <script> as text', () => {
    const { container } = renderInFlow(
      <RichText c={{ type: 'RichText', text: ['<script>alert(1)</script>'] }} />,
      flow,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container).toHaveTextContent('<script>alert(1)</script>');
  });

  it('RichText renders a javascript: link as plain text', () => {
    const { container } = renderInFlow(
      <RichText c={{ type: 'RichText', text: ['[click](javascript:alert(1))'] }} />,
      flow,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('.flow-rich__p')?.textContent).toBe('click');
  });

  it('gives inline siblings unique keys and the right structure', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = renderInFlow(
      <RichText
        c={{
          type: 'RichText',
          text: ['*a*[x](https://y.com)*b*', '*a*[x](https://y.com)_b_[z](https://z.com)'],
        }}
      />,
      flow,
    );
    const [p1, p2] = Array.from(container.querySelectorAll('.flow-rich__p'));
    expect(p1?.textContent).toBe('axb');
    expect(p1?.querySelectorAll('strong')).toHaveLength(2);
    expect(p1?.querySelectorAll('a')).toHaveLength(1);
    expect(p2?.textContent).toBe('axbz');
    expect(p2?.querySelectorAll('a')).toHaveLength(2);
    expect(p2?.querySelector('em')).toHaveTextContent('b');
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('text cost bounds', () => {
  it('a link label never spans "[" (keeps the link regex linear)', () => {
    renderInFlow(<TextBody c={{ type: 'TextBody', text: '[[[a](https://a.b/x)' }} />, flow);
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent(/^a$/);
    expect(link.parentElement?.textContent).toBe('[[a');
  });

  it('renders a 4k run of "[" in RichText quickly', () => {
    const start = performance.now();
    renderInFlow(<RichText c={{ type: 'RichText', text: '['.repeat(4096) }} />, flow);
    expect(performance.now() - start).toBeLessThan(200);
  });

  it('clamps interpolated text to 4096 characters per component', () => {
    const long = { data: { v: 'y'.repeat(50_000) } };
    const { container } = renderInFlow(
      <>
        <TextBody c={{ type: 'TextBody', text: '${data.v}' }} />
        <TextCaption c={{ type: 'TextCaption', text: '${data.v}' }} />
        <TextHeading c={{ type: 'TextHeading', text: '${data.v}' }} />
      </>,
      flow,
      long,
    );
    for (const el of container.querySelectorAll('p, h3')) {
      expect(el.textContent?.length).toBe(4096);
    }
  });

  it('clamps an interpolated RichText to 4096 characters per line and 100 lines', () => {
    const many = { data: { v: Array.from({ length: 500 }, () => 'z'.repeat(9000)).join('\n') } };
    const { container } = renderInFlow(
      <RichText c={{ type: 'RichText', text: '${data.v}' }} />,
      flow,
      many,
    );
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBeLessThanOrEqual(100);
    for (const p of paragraphs) expect(p.textContent!.length).toBeLessThanOrEqual(4096);
    expect(container.textContent!.length).toBeLessThanOrEqual(20_000);
  });

  it.each(['`', '```', 'https://a.b/ ', '*', '[a](https://a.b) '])(
    'renders a worst-case 4096-char run of %j quickly',
    (unit) => {
      const text = unit.repeat(Math.ceil(4096 / unit.length)).slice(0, 4096);
      const start = performance.now();
      renderInFlow(
        <>
          <TextBody c={{ type: 'TextBody', text }} />
          <RichText c={{ type: 'RichText', text }} />
        </>,
        flow,
      );
      expect(performance.now() - start).toBeLessThan(500);
    },
  );
});
