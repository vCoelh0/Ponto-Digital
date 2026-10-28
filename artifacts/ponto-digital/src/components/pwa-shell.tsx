import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Clock, Download, RefreshCw, WifiOff, X } from 'lucide-react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'ponto-digital-install-dismissed-until';
const WEEK = 7 * 24 * 60 * 60 * 1000;

function subscribeToConnection(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function wasDismissed() {
  try {
    return Number(localStorage.getItem(DISMISS_KEY)) > Date.now();
  } catch {
    return false;
  }
}

export function PwaShell({ children }: { children: ReactNode }) {
  const online = useSyncExternalStore(subscribeToConnection, () => navigator.onLine);
  const [hasBeenOnline, setHasBeenOnline] = useState(online);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [installed, setInstalled] = useState(isStandalone);
  const [showInstructions, setShowInstructions] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const lastUpdateCheck = useRef(Date.now());
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration;
    },
    onRegisterError(error) {
      console.error('Não foi possível preparar o aplicativo para instalação.', error);
    },
  });

  useEffect(() => {
    if (online) setHasBeenOnline(true);
  }, [online]);

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const appInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    const checkUpdate = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine ||
        Date.now() - lastUpdateCheck.current < 60 * 60 * 1000) return;
      lastUpdateCheck.current = Date.now();
      void registrationRef.current?.update().catch(() => {
        // A temporary network failure must not interrupt the current session.
      });
    };
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const displayChanged = () => setInstalled(isStandalone());
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', appInstalled);
    window.addEventListener('online', checkUpdate);
    document.addEventListener('visibilitychange', checkUpdate);
    displayMode.addEventListener('change', displayChanged);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', appInstalled);
      window.removeEventListener('online', checkUpdate);
      document.removeEventListener('visibilitychange', checkUpdate);
      displayMode.removeEventListener('change', displayChanged);
    };
  }, []);

  const dismissInstall = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + WEEK));
    } catch {
      // Dismissal still works for this visit when storage is unavailable.
    }
  };

  const install = async () => {
    if (!installPrompt) {
      setShowInstructions(true);
      return;
    }
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      else dismissInstall();
    } catch {
      // The native prompt may be unavailable after a browser navigation.
    } finally {
      setInstallPrompt(null);
      setInstalling(false);
    }
  };

  const update = async () => {
    setUpdating(true);
    setUpdateError(false);
    try {
      await updateServiceWorker(true);
    } catch {
      setUpdateError(true);
      setUpdating(false);
    }
  };

  const suggestInstall = online && !installed && !dismissed && (Boolean(installPrompt) || ios);

  return (
    <>
      {/* Keep mounted forms intact across connection changes, but never allow
          offline actions. On an offline launch Clerk does not need to load. */}
      <div hidden={!online}>{hasBeenOnline && children}</div>
      {!online && (
        <main className="flex min-h-[100dvh] items-center justify-center bg-background px-6 py-12 text-foreground">
          <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center" role="status">
            <Clock className="mx-auto mb-4 h-9 w-9 text-primary" aria-hidden="true" />
            <p className="mb-6 font-semibold">Ponto Digital</p>
            <WifiOff className="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-xl font-semibold">Você está sem conexão</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Conecte-se à internet para consultar e registrar seus períodos.
              Uma sessão já iniciada continua registrada no servidor.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">Voltaremos à sua tela quando a conexão retornar.</p>
          </section>
        </main>
      )}
      {online && (needRefresh || suggestInstall) && (
        <aside
          aria-label={needRefresh ? 'Atualização do aplicativo' : 'Instalar aplicativo'}
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-xl border border-border bg-card p-4 text-foreground shadow-xl sm:left-auto sm:right-4 sm:mx-0 sm:w-96"
        >
          <div className="flex items-start gap-3">
            {needRefresh ? <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /> :
              <Download className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{needRefresh ? 'Nova versão disponível' : 'Ponto Digital no seu celular'}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {needRefresh ? 'Atualize quando terminar suas alterações nesta tela.' :
                  'Instale o app para acessar direto pela tela inicial.'}
              </p>
              {showInstructions && !needRefresh && (
                <p className="mt-3 text-xs leading-relaxed" role="status">
                  No menu de compartilhamento do navegador, toque em <strong>Adicionar à Tela de Início</strong> e confirme em <strong>Adicionar</strong>.
                </p>
              )}
              {updateError && <p className="mt-2 text-xs text-destructive" role="alert">Não foi possível atualizar. Tente novamente.</p>}
              <button
                type="button"
                disabled={installing || updating}
                onClick={() => void (needRefresh ? update() : install())}
                className="mt-3 inline-flex min-h-9 items-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {needRefresh ? (updating ? 'Atualizando…' : 'Atualizar') :
                  (installing ? 'Abrindo…' : ios && !installPrompt ? 'Como instalar' : 'Instalar aplicativo')}
              </button>
            </div>
            <button
              type="button"
              aria-label={needRefresh ? 'Atualizar mais tarde' : 'Fechar sugestão de instalação'}
              disabled={updating}
              onClick={() => needRefresh ? setNeedRefresh(false) : dismissInstall()}
              className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
