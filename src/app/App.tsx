import { Component, useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  ArrowDownToLine,
  Boxes,
  ClipboardList,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { db, initializeDatabase } from '../core/database';
import { activateWaitingUpdate } from '../services/pwa';
import { Home } from '../features/sessions/Home';
import { SessionPage } from '../features/sessions/SessionPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import {
  Loading,
  Modal,
  NoticeProvider,
  errorMessage,
  navigate,
  useNotice,
  useTask,
} from '../components/ui';
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
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
    [install, setInstall] = useState<InstallEvent | null>(null),
    [installHelp, setInstallHelp] = useState(false),
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
  });
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
    const installer = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    const installed = () => setInstall(null);
    window.addEventListener('hashchange', routeChange);
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    window.addEventListener('beforeinstallprompt', installer);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('hashchange', routeChange);
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
      window.removeEventListener('beforeinstallprompt', installer);
      window.removeEventListener('appinstalled', installed);
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
          aria-label="Leitor de Almoxarifado — início"
        >
          <span className="brand-mark">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" />
          </span>
          <span>
            Leitor<span className="brand-sub">Almoxarifado</span>
          </span>
        </button>
        <nav aria-label="Navegação principal">
          <button
            aria-label="Levantamentos"
            className={route !== '/settings' ? 'nav-active' : ''}
            onClick={() => navigate('/')}
          >
            <ClipboardList />
            <span>Levantamentos</span>
          </button>
          <button
            aria-label="Configurações"
            className={route === '/settings' ? 'nav-active' : ''}
            onClick={() => navigate('/settings')}
          >
            <Settings2 />
            <span>Configurações</span>
          </button>
        </nav>
        <div className="header-status">
          <span className={online ? 'connection' : 'connection offline'}>
            {online ? <Wifi /> : <WifiOff />}
            {online ? 'Online' : 'Offline'}
          </span>
          <button
            className="install-button"
            aria-label="Instalar aplicativo"
            onClick={() => {
              if (install)
                void task(async () => {
                  await install.prompt();
                  const choice = await install.userChoice;
                  if (choice.outcome === 'accepted') setInstall(null);
                });
              else setInstallHelp(true);
            }}
          >
            <ArrowDownToLine />
            <span>Instalar app</span>
          </button>
        </div>
      </header>
      {needRefresh && (
        <div className="update-banner">
          <span>
            <RefreshCw />
            Nova versão disponível. Seus levantamentos serão preservados.
          </span>
          <button
            disabled={updating}
            onClick={() =>
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
              })
            }
          >
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
      {installHelp && (
        <Modal
          title="Instalar no dispositivo"
          onClose={() => setInstallHelp(false)}
        >
          <p>
            No Chrome ou Edge, abra o menu do navegador e escolha{' '}
            <strong>Instalar aplicativo</strong> ou{' '}
            <strong>Adicionar à tela inicial</strong>.
          </p>
          <p>
            No iPhone, abra no Safari, toque em <strong>Compartilhar</strong> e
            depois em <strong>Adicionar à Tela de Início</strong>.
          </p>
          <p className="helper">
            A instalação fica disponível após publicar em HTTPS. Espere o aviso
            “Pronto para uso offline” antes de sair sem conexão.
          </p>
          <button className="primary" onClick={() => setInstallHelp(false)}>
            Entendi
          </button>
        </Modal>
      )}
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
