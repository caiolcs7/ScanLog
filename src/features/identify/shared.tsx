import { AlertTriangle, CloudUpload, RefreshCw, Trash2 } from 'lucide-react';
import { downloadBlob } from '../../services/download';
import {
  discardEntry,
  flushOutbox,
  type OutboxEntry,
} from '../../cloud/outbox';

/**
 * No celular abre o compartilhamento (WhatsApp, e-mail…); no computador baixa.
 */
export async function saveOrShare(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (
    touch &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  downloadBlob(blob, name);
}

/** Cadastros ainda no aparelho: mostra o envio e permite tentar de novo. */
export function OutboxBanner({ entries }: { entries: OutboxEntry[] }) {
  const items = entries.filter((e) => e.kind === 'item').length;
  if (!entries.length) return null;
  const failed = entries.find((e) => e.error);
  return (
    <div className={`outbox-banner ${failed ? 'warning' : ''}`} role="status">
      {failed ? <AlertTriangle /> : <CloudUpload className="pulse-once" />}
      <span>
        {items
          ? `${items} ${items === 1 ? 'item aguardando' : 'itens aguardando'} envio.`
          : 'Lote aguardando envio.'}
        {failed && <small>{failed.error}</small>}
        {!navigator.onLine && (
          <small>Sem conexão. Envia sozinho quando o sinal voltar.</small>
        )}
      </span>
      <button onClick={() => void flushOutbox()}>
        <RefreshCw />
        Enviar agora
      </button>
      {failed && failed.attempts >= 3 && (
        <button
          className="danger"
          onClick={() => {
            if (
              confirm(
                'Descartar este cadastro? Ele não foi enviado e será perdido.',
              )
            )
              void discardEntry(failed.id);
          }}
        >
          <Trash2 />
          Descartar
        </button>
      )}
    </div>
  );
}
