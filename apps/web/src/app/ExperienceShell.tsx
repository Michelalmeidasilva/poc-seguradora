import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Device, Theme } from './usePresentation';
import { usePresentation } from './usePresentation';
import './experience.css';

type View = 'conversation' | 'catalog';
const devices: { value: Device; label: string }[] = [
  { value: 'iphone', label: 'iPhone' },
  { value: 'android', label: 'Android' },
  { value: 'desktop', label: 'Desktop' },
];
const themes: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'system', label: 'Sistema' },
];

export function ExperienceShell({
  conversation,
  catalog,
  overlay,
}: {
  conversation: ReactNode;
  catalog: ReactNode;
  overlay: ReactNode;
}) {
  const presentation = usePresentation();
  const [view, setView] = useState<View>('conversation');
  const [settings, setSettings] = useState(false);
  const [catalogVisited, setCatalogVisited] = useState(false);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!settings) return;
    const dialog = settingsRef.current;
    const trigger = opener.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      trigger?.focus();
    };
  }, [settings]);

  function select(next: View) {
    if (next === 'catalog') setCatalogVisited(true);
    setView(next);
  }

  function tabs(prefix: string) {
    return (
      <div className="experience__tabs" role="tablist" aria-label="Visualização">
        {(
          [
            { value: 'conversation', label: 'Conversa' },
            { value: 'catalog', label: 'Catálogo' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={`${id}-${prefix}-${tab.value}`}
            aria-selected={view === tab.value}
            aria-controls={`${id}-${tab.value}`}
            tabIndex={view === tab.value ? 0 : -1}
            onClick={() => {
              select(tab.value);
              if (prefix === 'mobile') setSettings(false);
            }}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 'conversation'
                  : event.key === 'End'
                    ? 'catalog'
                    : view === 'conversation'
                      ? 'catalog'
                      : 'conversation';
              select(next);
              event.currentTarget.parentElement
                ?.querySelector<HTMLButtonElement>(`[id="${id}-${prefix}-${next}"]`)
                ?.focus();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  function preferences() {
    return (
      <div className="experience__preferences">
        <div className="experience__segment" role="group" aria-label="Aparelho">
          {devices.map((item) => (
            <button
              type="button"
              key={item.value}
              aria-pressed={presentation.device === item.value}
              onClick={() => presentation.setDevice(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="experience__segment" role="group" aria-label="Tema">
          {themes.map((item) => (
            <button
              type="button"
              key={item.value}
              aria-pressed={presentation.theme === item.value}
              onClick={() => presentation.setTheme(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <main className={`experience${presentation.native ? ' experience--native' : ''}`}>
      <div className="experience__workspace">
        <div className="experience__topline">
          <div className="experience__brand">
            <span aria-hidden="true">d</span>
            <strong>Digio Assistências</strong>
          </div>
          <small>Atendimento digital</small>
        </div>
        <div className="experience__controls" inert={settings || Boolean(overlay)}>
          {tabs('desktop')}
          {preferences()}
        </div>
        <div className="experience__stage">
          <div className="experience__device" data-device={presentation.device}>
            <div className="experience__statusbar" aria-hidden="true">
              <span className="experience__clock">
                {presentation.device === 'desktop'
                  ? 'Digio Assistências · WhatsApp'
                  : presentation.device === 'android'
                    ? '12:30'
                    : '9:41'}
              </span>
              <span className="experience__island" />
              <span className="experience__signals">
                ▂▄▆ <span>◔</span> ▰
              </span>
            </div>
            <div className="experience__body" inert={settings || Boolean(overlay)}>
              <button
                type="button"
                className="experience__settings-button"
                ref={opener}
                aria-label="Configurações de visualização"
                onClick={() => setSettings(true)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M3 6h18M3 12h18M3 18h18" />
                  <circle cx="8" cy="6" r="2" fill="currentColor" />
                  <circle cx="16" cy="12" r="2" fill="currentColor" />
                  <circle cx="8" cy="18" r="2" fill="currentColor" />
                </svg>
              </button>
              <section
                id={`${id}-conversation`}
                role="tabpanel"
                aria-label="Conversa"
                hidden={view !== 'conversation'}
              >
                {conversation}
              </section>
              <section
                id={`${id}-catalog`}
                role="tabpanel"
                aria-label="Catálogo"
                hidden={view !== 'catalog'}
              >
                {catalogVisited ? catalog : null}
              </section>
            </div>
            {overlay}
            <div className="experience__home" aria-hidden="true" />
          </div>
        </div>
      </div>
      {settings ? (
        <dialog
          ref={settingsRef}
          className="experience__settings"
          aria-labelledby={`${id}-settings-title`}
          onCancel={(event) => {
            event.preventDefault();
            setSettings(false);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              const rect = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom
              )
                setSettings(false);
            }
          }}
        >
          <div className="experience__settings-top">
            <h2 id={`${id}-settings-title`}>Visualização</h2>
            <button
              type="button"
              aria-label="Fechar configurações"
              onClick={() => setSettings(false)}
            >
              ×
            </button>
          </div>
          {tabs('mobile')}
          {preferences()}
          <button type="button" className="experience__done" onClick={() => setSettings(false)}>
            Voltar à visualização
          </button>
        </dialog>
      ) : null}
    </main>
  );
}
