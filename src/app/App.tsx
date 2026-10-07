import { Component, useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Boxes, ClipboardList, RefreshCw, ShieldCheck } from 'lucide-react';
import { db, initializeDatabase } from '../core/database';
import { activateWaitingUpdate } from '../services/pwa';
import { Home } from '../features/sessions/Home';
import { SessionPage } from '../features/sessions/SessionPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import {
  Loading,
  NoticeProvider,
  errorMessage,
  navigate,
  useNotice,
  useTask,
} from '../components/ui';
export function App() {
  return (
    <ErrorBoundary>
      <NoticeProvider>
        <Application />
      </NoticeProvider>
    </ErrorBoundary>
  );
}
function Application() {
  const [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [route, setRoute] = useState(window.location.hash.slice(1) || '/'),
    [online, setOnline] = useState(navigator.onLine),
    [swError, setSwError] = useState(false),
    [cached, setCached] = useState(false),
    [updating, setUpdating] = useState(false);
  const settings = useLiveQuery(() => db.settings.get('main'), []);
  const notice = useNotice(),
    task = useTask();
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
  } = useRegisterSW({
    onRegisterError: () => setSwError(true),
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      // Installed PWAs can stay open for days: look for new versions
      // periodically and whenever the app returns to the foreground.
      const check = () => void registration.update().catch(() => {});
      setInterval(check, 15 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
  const applyUpdate = () =>
    void task(async () => {
      setUpdating(true);
      try {
        await db.transaction(
          'rw',
          db.sessions,
          db.records,
          db.history,
          async () => {},
        );
        await activateWaitingUpdate();
      } catch (error) {
        setUpdating(false);
        notice(errorMessage(error), 'error');
      }
    });
  const scanning = /^\/session\/[^/]+\/scanner$/.test(route);
  useEffect(() => {
    // Outside a scanning screen nothing is in flight, so update right away.
    if (needRefresh && ready && !scanning && !updating) applyUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRefresh, ready, scanning]);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setSwError(true);
    }, 30000);
    void navigator.serviceWorker.ready.then((registration) => {
      if (!cancelled && registration.active) {
        clearTimeout(timer);
        setCached(true);
        setSwError(false);
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    void initializeDatabase()
      .then(() => setReady(true))
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    const routeChange = () => {
      setRoute(window.location.hash.slice(1) || '/');
      window.scrollTo(0, 0);
    };
    const network = () => setOnline(navigator.onLine);
    window.addEventListener('hashchange', routeChange);
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    return () => {
      window.removeEventListener('hashchange', routeChange);
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
    };
  }, []);
  useEffect(() => {
    const theme = settings?.theme ?? 'light';
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings?.theme]);
  const match = /^\/session\/([^/]+)\/(scanner|records)$/.exec(route);
  if (error)
    return (
      <main className="fatal-error">
        <DatabaseError />
        <h1>Não foi possível abrir seus dados</h1>
        <p>{error}</p>
        <p>
          Permita o armazenamento neste navegador e verifique o espaço livre.
          Não limpe os dados se houver levantamentos sem backup.
        </p>
        <button className="primary" onClick={() => window.location.reload()}>
          Tentar novamente
        </button>
      </main>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo
      </a>
      <header className="app-header">
        <button
          className="brand"
          onClick={() => navigate('/')}
          aria-label="ScanLog — início"
        >
          <span className="brand-mark">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" />
          </span>
          <img
            className="brand-wordmark"
            src={`${import.meta.env.BASE_URL}wordmark.svg`}
            alt=""
          />
        </button>
        <nav aria-label="Navegação principal">
          <button
            aria-label="Levantamentos"
            aria-current={route !== '/settings' ? 'page' : undefined}
            className={`nav-survey ${route !== '/settings' ? 'nav-active' : ''}`}
            onClick={() => navigate('/')}
          >
            <span className="nav-survey__text">Levantamentos</span>
            <span className="nav-survey__orb" aria-hidden="true">
              <ClipboardList />
            </span>
          </button>
          <button
            aria-label="Configurações"
            aria-current={route === '/settings' ? 'page' : undefined}
            className={`nav-settings ${route === '/settings' ? 'nav-active' : ''}`}
            onClick={() => navigate('/settings')}
          >
            <span className="nav-settings__content">
              <svg
                className="nav-settings__icon"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 2L9.09 5H4v4.09L1 12l3 2.91V19h5.09L12 22l2.91-3H20v-5.09L23 12l-3-2.91V5h-5.09L12 2zm0 4.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11zm0 2a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" />
              </svg>
              <span className="nav-settings__text">Configurações</span>
            </span>
          </button>
        </nav>
      </header>
      {needRefresh && (
        <div className="update-banner">
          <span>
            <RefreshCw />
            Nova versão disponível. Seus levantamentos serão preservados.
          </span>
          <button disabled={updating} onClick={applyUpdate}>
            Atualizar
          </button>
        </div>
      )}
      {swError && (
        <div className="update-banner warning">
          <span>
            Não foi possível preparar o modo offline. Conecte-se e recarregue o
            aplicativo.
          </span>
          <button onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      )}
      <div id="main-content" tabIndex={-1}>
        {!ready || !settings || updating ? (
          <Loading
            text={
              updating
                ? 'Atualizando com os dados salvos…'
                : 'Abrindo dados locais…'
            }
          />
        ) : match ? (
          <SessionPage
            key={match[1]}
            id={match[1]}
            view={match[2]}
            settings={settings}
          />
        ) : route === '/settings' ? (
          <SettingsPage key={settings.id} settings={settings} />
        ) : (
          <Home settings={settings} />
        )}
      </div>
      <div className="app-bottom">
        <span>
          <ShieldCheck />
          Dados somente neste dispositivo
        </span>
        <span>
          {offlineReady || cached
            ? 'Pronto para uso offline'
            : online
              ? 'Preparação offline automática'
              : 'Sem conexão'}
        </span>
      </div>
    </div>
  );
}
function DatabaseError() {
  return <Boxes size={44} />;
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal-error">
        <h1>O aplicativo encontrou um problema</h1>
        <p>
          Reabra a página para tentar novamente. Seus dados salvos permanecem no
          dispositivo.
        </p>
        <button onClick={() => window.location.reload()}>
          Reabrir aplicativo
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
