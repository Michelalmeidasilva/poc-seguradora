import '../flows.css';
import { useFlow } from '../FlowContext';
import { currentScreen, visibleComponents } from '../runtime';
import { renderComponent } from './registry';

/** Renders the current screen's SingleColumnLayout; If/Switch/visible are resolved upstream. */
export function Layout() {
  const { flow, state, scope } = useFlow();
  const screen = currentScreen(flow, state);
  return (
    <div className="flow-layout">
      {visibleComponents(screen, scope).map((c, i) => renderComponent(c, `${screen.id}:${i}`))}
    </div>
  );
}
