import { useEffect, useState } from 'react';
import { supabase } from './client';
import { SUPABASE_URL } from './config';
import { operatorName } from './auth';

/**
 * Notificações da Identificação (Web Push). A estrutura recebe aviso de
 * levantamento novo e o almoxarifado de código preenchido; o administrador
 * recebe os dois. O papel vem da conta logada, não do aparelho.
 */
export type PushState =
  'unsupported' | 'ios-install' | 'denied' | 'off' | 'on' | 'loading';

const isIos = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true;

function supported() {
  return (
    import.meta.env.PROD &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}
/** Inscrição atual sem esperar o service worker (sair nunca trava). */
async function currentSub() {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}
async function registration() {
  return navigator.serviceWorker.ready;
}
export async function pushState(): Promise<PushState> {
  if (!supported())
    return isIos() && !standalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await currentSub();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

let publicKey: Promise<string> | null = null;
function serverKey() {
  publicKey ??= fetch(`${SUPABASE_URL}/functions/v1/notificar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo: 'chave' }),
  })
    .then(async (r) => {
      const body = (await r.json()) as { chave?: string };
      if (!r.ok || !body.chave) throw new Error();
      return body.chave;
    })
    .catch(() => {
      publicKey = null;
      throw new Error(
        'Serviço de notificações indisponível. Tente mais tarde.',
      );
    });
  return publicKey;
}
function bytes(base64url: string) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
function base64url(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
async function save(sub: PushSubscription) {
  const json = sub.toJSON();
  const client = await supabase();
  const { error } = await client.rpc('push_inscrever', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_nome: operatorName(),
  });
  if (error) throw new Error('Não foi possível ativar as notificações.');
}

/** Pede permissão, inscreve o aparelho e grava com o papel da conta. */
export async function enablePush() {
  if (!supported())
    throw new Error(
      isIos()
        ? 'No iPhone, adicione o ScanLog à Tela de Início (Compartilhar → Adicionar à Tela de Início) e ative por lá.'
        : 'Este navegador não recebe notificações.',
    );
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error(
      'Notificações bloqueadas. Libere nas configurações do navegador para o ScanLog.',
    );
  const reg = await registration();
  const key = await serverKey();
  let sub = await reg.pushManager.getSubscription();
  // Chave do servidor mudou: refaz a inscrição.
  const current = sub?.options.applicationServerKey;
  if (sub && current && base64url(current) !== key.replace(/=+$/, '')) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: bytes(key),
  });
  await save(sub);
}
/** Desliga neste aparelho. */
export async function disablePush() {
  if (!supported()) return;
  const sub = await currentSub();
  if (!sub) return;
  const client = await supabase();
  await client.rpc('push_cancelar', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}
/**
 * Ao entrar (ou trocar de setor), a inscrição já existente é regravada com o
 * papel atual. Sem permissão, nada é pedido.
 */
export async function refreshPush() {
  if (!supported() || Notification.permission !== 'granted') return;
  const sub = await currentSub();
  if (sub) await save(sub).catch(() => {});
}
/** Sai da conta: este aparelho para de receber avisos do setor. */
export async function forgetPush() {
  await disablePush().catch(() => {});
}

export function usePush(userId: string) {
  const [state, setState] = useState<PushState>('loading');
  useEffect(() => {
    let alive = true;
    void pushState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState('unsupported'));
    void refreshPush();
    return () => {
      alive = false;
    };
  }, [userId]);
  return {
    state,
    async enable() {
      await enablePush();
      setState('on');
    },
    async disable() {
      await disablePush();
      setState('off');
    },
  };
}
