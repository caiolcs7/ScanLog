import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, Info, X, AlertCircle, LoaderCircle } from 'lucide-react';
type Tone = 'success' | 'error' | 'info';
type Notice = {
  message: string;
  tone: Tone;
  action?: { label: string; run: () => void };
};
const NoticeContext = createContext<
  (message: string, tone?: Tone, action?: Notice['action']) => void
>(() => {});
export const useNotice = () => useContext(NoticeContext);
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => setNotice(null),
      notice.action ? 10000 : 5500,
    );
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <NoticeContext.Provider
      value={(message, tone = 'info', action) =>
        setNotice({ message, tone, action })
      }
    >
      {children}
      {notice && (
        <div
          className={`toast ${notice.tone}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.tone === 'error' ? (
            <AlertCircle />
          ) : notice.tone === 'success' ? (
            <CheckCircle2 />
          ) : (
            <Info />
          )}
          <span>{notice.message}</span>
          {notice.action && (
            <button
              onClick={() => {
                const action = notice.action;
                setNotice(null);
                action?.run();
              }}
            >
              {notice.action.label}
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Fechar aviso"
            onClick={() => setNotice(null)}
          >
            <X />
          </button>
        </div>
      )}
    </NoticeContext.Provider>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? 'modal wide' : 'modal'}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" aria-label="Fechar" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Confirm({
  title,
  message,
  onClose,
  onConfirm,
  strong,
}: {
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  strong?: string;
}) {
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      {strong && (
        <label>
          Digite {strong} para confirmar
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
          />
        </label>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button
          className="danger"
          disabled={busy || (!!strong && text !== strong)}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Aguarde…' : 'Confirmar exclusão'}
        </button>
      </div>
    </Modal>
  );
}
export function Loading({ text = 'Carregando…' }: { text?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" />
      {text}
    </div>
  );
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Não foi possível salvar. Verifique o armazenamento do navegador e tente novamente.';
}
export function useTask() {
  const notice = useNotice();
  return async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      notice(errorMessage(error), 'error');
    }
  };
}
export function dateTime(timestamp: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(timestamp);
}
export function navigate(path: string) {
  window.location.hash = path;
}
export function ExcelIcon() {
  return (
    <svg viewBox="0 0 50 50" fill="currentColor" aria-hidden="true">
      <path d="M28.81.03.81 5.34C.34 5.43 0 5.86 0 6.34v37.32c0 .48.34.91.81 1L28.81 49.97c.06.01.13.03.19.03.23 0 .45-.07.63-.22.23-.19.37-.48.37-.78V1c0-.3-.14-.59-.37-.78a1.03 1.03 0 0 0-.82-.19ZM32 6v7h2v2h-2v5h2v2h-2v5h2v2h-2v6h2v2h-2v7h15a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm4 7h8v2h-8ZM6.69 15.69h5.12l2.69 5.59c.21.44.4.98.56 1.6h.03c.11-.37.31-.94.6-1.66l2.97-5.53h4.69l-5.6 9.25 5.75 9.44h-4.97l-3.25-6.1c-.12-.22-.25-.64-.38-1.25h-.03c-.06.29-.21.73-.44 1.31l-3.25 6.04h-5l5.97-9.34ZM36 20h8v2h-8Zm0 7h8v2h-8Zm0 8h8v2h-8Z" />
    </svg>
  );
}
/** Galão identifier with the upper-floor (A2) suffix highlighted. */
export function GalaoCode({ value }: { value: string }) {
  const upper = /^R[0-9]+G[0-9]+S$/.test(value);
  return (
    <code title={upper ? 'Galão do andar 2 (sufixo S)' : undefined}>
      {upper ? value.slice(0, -1) : value}
      {upper && <span className="galao-suffix">S</span>}
    </code>
  );
}
export type MenuItem = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
};
/** Compact actions menu: animated hamburger button + popover list. */
export function MoreMenu({
  label,
  items,
}: {
  label: string;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const entries = () => [
      ...(root.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ) ?? []),
    ];
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('.more-button')?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = entries(),
          i = list.indexOf(document.activeElement as HTMLButtonElement),
          step = e.key === 'ArrowDown' ? 1 : -1;
        list.at((i + step) % list.length)?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keys);
    entries()[0]?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keys);
    };
  }, [open]);
  return (
    <div ref={root} className={`more-menu${open ? ' active' : ''}`}>
      <button
        type="button"
        className="more-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="menu-icon" aria-hidden="true">
          <span className="menu-icon-line half first" />
          <span className="menu-icon-line" />
          <span className="menu-icon-line half last" />
        </span>
      </button>
      <div className="more-button-list" role="menu" aria-label={label}>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            className={`more-button-list-item${item.danger ? ' danger' : ''}`}
            onClick={() => {
              setOpen(false);
              item.onSelect();
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
