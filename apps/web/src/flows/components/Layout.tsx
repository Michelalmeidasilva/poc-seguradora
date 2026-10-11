import '../flows.css';
import { useFlow } from '../FlowContext';
import { currentScreen, visibleEntries } from '../runtime';
import { renderComponent } from './registry';

/** Renders the current screen's SingleColumnLayout; If/Switch/visible are resolved upstream. */
export function Layout() {
  const { flow, state, scope } = useFlow();
  const screen = currentScreen(flow, state);
  return (
    <div className="flow-layout">
      {visibleEntries(screen, scope).map((e) =>
        renderComponent(e.component, `${screen.id}:${e.path}`),
      )}
    </div>
  );
}
