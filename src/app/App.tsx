import { Component, useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Boxes, Cloud, RefreshCw, ShieldCheck } from 'lucide-react';
import { db, initializeDatabase } from '../core/database';
import { activateWaitingUpdate } from '../services/pwa';
import { protectStorage } from '../services/storage';
import { Home } from '../features/sessions/Home';
import { SessionPage } from '../features/sessions/SessionPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { IdentifyArea } from '../features/identify/IdentifyArea';
import { NotFound } from '../features/notfound/NotFound';
import { MainNav, type NavArea } from './MainNav';
import { BrandLogo } from '../components/BrandLogo';
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
      // Sem timer: procura versão nova só quando o app volta para a tela.
      const check = () => void registration.update().catch(() => {});
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
  // Leitura ou cadastro em andamento: a atualização espera o botão.
  const scanning =
    /^\/session\/[^/]+\/scanner$/.test(route) || /^\/identifica/.test(route);
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
    // Dados são preciosos: pede proteção contra limpeza automática ao abrir
    // e de novo no primeiro toque (alguns navegadores exigem um gesto).
    void protectStorage().then((granted) => {
      if (granted) return;
      const retry = () => void protectStorage();
      window.addEventListener('pointerdown', retry, { once: true });
    });
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
  const match = /^\/session\/([^/]+)\/(scanner|records)$/.exec(route),
    identify = /^\/(?:identificacao|identify)(?:\/([^/?]+))?/.exec(route);
  const home = route === '/' || route === '';
  const notFound = wrongPath()
    ? window.location.pathname
    : !match && !identify && !home && route !== '/settings'
      ? route
      : null;
  const area: NavArea = notFound
    ? 'none'
    : identify
      ? 'identify'
      : route === '/settings'
        ? 'settings'
        : 'surveys';
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
          <BrandLogo />
        </button>
        <MainNav area={area} vibrate={!!settings?.vibration} />
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
        ) : notFound !== null ? (
          <NotFound path={notFound} />
        ) : match ? (
          <SessionPage
            key={match[1]}
            id={match[1]}
            view={match[2]}
            settings={settings}
          />
        ) : identify ? (
          <IdentifyArea lotId={identify[1]} settings={settings} />
        ) : route === '/settings' ? (
          <SettingsPage key={settings.id} settings={settings} />
        ) : (
          <Home settings={settings} />
        )}
      </div>
      <div className="app-bottom">
        {area === 'identify' ? (
          <span>
            <Cloud />
            Identificação compartilhada na nuvem
          </span>
        ) : (
          <span>
            <ShieldCheck />
            Levantamentos salvos só neste aparelho
          </span>
        )}
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
/**
 * Caminho fora do app (ex.: /ScanLog/qualquer-coisa servido pelo service
 * worker). As telas usam rotas com #, então o caminho deve ser a raiz.
 */
function wrongPath() {
  const base = import.meta.env.BASE_URL;
  if (!base.startsWith('/')) return false;
  const path = window.location.pathname;
  return path !== base && path !== `${base}index.html`;
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
