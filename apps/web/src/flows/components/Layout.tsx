import '../flows.css';
import type { ReactNode } from 'react';
import type { TextComponent } from '../schema';
import { useFlow } from '../FlowContext';
import { currentScreen, visibleEntries } from '../runtime';
import { renderComponent } from './registry';
import { TextBody } from './text';

/** Renders the current screen's SingleColumnLayout; If/Switch/visible are resolved upstream. */
export function Layout({ review = false }: { review?: boolean }) {
  const { flow, state, scope } = useFlow();
  const screen = currentScreen(flow, state);
  const content: ReactNode[] = [];
  let section: { key: string; children: ReactNode[] } | undefined;
  const flush = () => {
    if (section)
      content.push(
        <section key={section.key} className="flow-review-section">
          {section.children}
        </section>,
      );
    section = undefined;
  };
  for (const entry of visibleEntries(screen, scope)) {
    const key = `${screen.id}:${entry.path}`;
    const component = entry.component;
    if (review && component.type === 'TextSubheading') {
      flush();
      section = { key, children: [renderComponent(component, key)] };
    } else if (section && component.type === 'TextBody') {
      // Known TextBody components were validated by parseFlow; UnknownComponent has a broad type.
      section.children.push(<TextBody key={key} c={component as TextComponent} reviewLine />);
    } else {
      flush();
      content.push(renderComponent(component, key));
    }
  }
  flush();
  return <div className="flow-layout">{content}</div>;
}
