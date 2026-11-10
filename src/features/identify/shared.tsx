import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  CloudUpload,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { Sector } from '../../cloud/config';
import { usePush } from '../../cloud/push';
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

const pushAbout: Record<Sector, string> = {
  almoxarifado: 'Receba um aviso quando a estrutura preencher um código.',
  estrutura: 'Receba um aviso quando chegar um levantamento novo.',
  admin:
    'Receba os avisos dos dois setores: levantamento novo e código preenchido.',
};
/** Convite para ligar as notificações deste aparelho. */
export function PushBanner({
  sector,
  userId,
  compact = false,
}: {
  sector: Sector;
  userId: string;
  /** Na tela de configurações: mostra também o estado ligado, com Desligar. */
  compact?: boolean;
}) {
  const push = usePush(userId);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (push.state === 'loading' || push.state === 'unsupported') return null;
  if (push.state === 'on' && !compact) return null;
  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ativar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="push-banner" role="status">
      {push.state === 'on' ? <BellRing /> : <Bell />}
      <span>
        {push.state === 'on'
          ? 'Notificações ligadas neste aparelho.'
          : push.state === 'ios-install'
            ? 'No iPhone, adicione o ScanLog à Tela de Início (Compartilhar → Adicionar à Tela de Início) para receber avisos.'
            : push.state === 'denied'
              ? 'Notificações bloqueadas. Libere nas configurações do navegador para o ScanLog.'
              : pushAbout[sector]}
        {error && <small>{error}</small>}
      </span>
      {push.state === 'off' && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => void act(push.enable)}
        >
          <Bell />
          {busy ? 'Ativando…' : 'Ativar notificações'}
        </button>
      )}
      {push.state === 'on' && (
        <button disabled={busy} onClick={() => void act(push.disable)}>
          <BellOff />
          Desligar
        </button>
      )}
    </div>
  );
}
