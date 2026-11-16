import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Camera,
  CircleCheck,
  Container,
  CornerDownRight,
  ImagePlus,
  LoaderCircle,
  MapPin,
  MessageCircleQuestion,
  MessagesSquare,
  Ruler,
  Scale,
  SendHorizontal,
  X,
} from 'lucide-react';
import { errorMessage, useNotice } from '../../components/ui';
import { itemLabel } from '../../core/identify';
import { formatKg } from '../../core/weight';
import { usePhotoUrls, useBlobUrls } from '../../cloud/hooks';
import type { Sector } from '../../cloud/config';
import {
  cancelRequest,
  formatMeasure,
  listMessages,
  markRead,
  parseMeasure,
  requestLabel,
  sendMessage,
  sideLabel,
  sidesOf,
  unreadFor,
  uploadChatPhoto,
  watchMessages,
} from '../../cloud/conversa';
import type {
  CloudItem,
  CloudMessage,
  RequestKind,
  Side,
  Unit,
} from '../../cloud/types';
import { compressPhoto } from '../../services/photo';
import { PhotoCapture } from './PhotoCapture';
import { PhotoViewer } from './PhotoViewer';

type ChatItem = Pick<
  CloudItem,
  | 'id'
  | 'lot_id'
  | 'ord'
  | 'status'
  | 'address'
  | 'bombona'
  | 'weight_g'
  | 'photos'
  | 'thumb_path'
  | 'msg_count'
  | 'pedidos_abertos'
  | 'ultima_msg'
  | 'ultima_msg_em'
  | 'ultima_msg_lado'
  | 'lido_almox_em'
  | 'lido_estrutura_em'
>;

/** Atalhos de pedido: um toque monta o pedido, o texto continua livre. */
const SUGGESTIONS: Record<RequestKind, string[]> = {
  medida: [
    'Diâmetro externo',
    'Diâmetro interno',
    'Comprimento',
    'Largura',
    'Altura',
    'Espessura',
    'Passo da rosca',
  ],
  foto: [
    'Etiqueta ou plaqueta',
    'Gravação ou marcação',
    'Outro lado',
    'De perto, com régua',
    'Rosca',
    'Encaixe ou conector',
  ],
  info: [
    'Tem marca ou fabricante?',
    'Qual o material?',
    'Quantas unidades tem?',
    'Tem número de série?',
  ],
};
const ASK: Record<
  RequestKind,
  { icon: ReactNode; verb: string; hint: string }
> = {
  medida: { icon: <Ruler />, verb: 'Pedir medida', hint: 'O que medir?' },
  foto: { icon: <Camera />, verb: 'Pedir foto', hint: 'Foto de quê?' },
  info: {
    icon: <MessageCircleQuestion />,
    verb: 'Perguntar',
    hint: 'O que você precisa saber?',
  },
};
const UNITS: Unit[] = ['mm', 'cm', 'm', 'pol'];

const time = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});
const dayKey = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});
function dayLabel(iso: string) {
  const key = dayKey.format(new Date(iso));
  if (key === dayKey.format(new Date())) return 'Hoje';
  if (key === dayKey.format(new Date(Date.now() - 864e5))) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

type Mode =
  | { kind: 'text' }
  | { kind: 'ask'; pedido: RequestKind }
  | { kind: 'answer'; to: CloudMessage };
type Draft = { blob: Blob; width: number; height: number };

/**
 * Conversa do item entre a estrutura e o almoxarifado. A estrutura pede uma
 * medida, uma foto ou uma informação; o almoxarifado responde com número,
 * foto ou texto. Mensagens novas chegam na hora enquanto está aberta.
 */
export function ItemChat({
  item,
  lotName,
  sector,
  startAsk,
  onClose,
}: {
  item: ChatItem;
  lotName: string;
  sector: Sector;
  startAsk?: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    scroller = useRef<HTMLDivElement>(null),
    titleId = useId();
  const notice = useNotice();
  const sides = sidesOf(sector);
  const asks = sides.includes('estrutura'),
    answers = sides.includes('almoxarifado');
  const closed = item.status === 'confirmado' && sector !== 'admin';
  const [messages, setMessages] = useState<CloudMessage[] | null>(null),
    [loadError, setLoadError] = useState(''),
    [mode, setMode] = useState<Mode>(
      startAsk && asks ? { kind: 'ask', pedido: 'medida' } : { kind: 'text' },
    ),
    [picked, setPicked] = useState(false);
  const read = useRef('');
  const reload = useCallback(async () => {
    try {
      const list = await listMessages(item.id);
      setMessages(list);
      setLoadError('');
      // Abriu e viu: tira o aviso de mensagem nova do seu setor.
      const last = list.at(-1);
      if (
        last &&
        sector !== 'admin' &&
        !sides.includes(last.lado) &&
        read.current !== last.id
      ) {
        read.current = last.id;
        void markRead(item.id).catch(() => {});
      }
    } catch (e) {
      setLoadError(errorMessage(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, sector]);
  useEffect(() => {
    dialog.current?.showModal();
    void reload();
    const stop = watchMessages(item.id, () => void reload());
    const visible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [item.id, reload]);
  const open = useMemo(
    () => (messages ?? []).filter((m) => m.situacao === 'aberto'),
    [messages],
  );
  // O almoxarifado abre direto respondendo o pedido mais antigo.
  useEffect(() => {
    if (picked || !messages || closed) return;
    if (answers && !asks && open.length)
      setMode({ kind: 'answer', to: open[0] });
    setPicked(true);
  }, [messages, open, answers, asks, picked, closed]);
  // Pedido respondido em outro aparelho: sai do modo resposta.
  useEffect(() => {
    if (mode.kind === 'answer' && !open.some((m) => m.id === mode.to.id))
      setMode(
        open.length && answers
          ? { kind: 'answer', to: open[0] }
          : { kind: 'text' },
      );
  }, [open, mode, answers]);
  const count = messages?.length ?? 0;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const byId = useMemo(
    () => new Map((messages ?? []).map((m) => [m.id, m])),
    [messages],
  );
  const paths = useMemo(
    () => (messages ?? []).flatMap((m) => (m.foto ? [m.foto.path] : [])),
    [messages],
  );
  const urls = usePhotoUrls(paths);
  const itemPaths = item.photos.length
    ? item.photos.map((p) => p.path)
    : item.thumb_path
      ? [item.thumb_path]
      : [];
  const itemUrls = usePhotoUrls(itemPaths.slice(0, 1));
  const [viewing, setViewing] = useState<string[] | null>(null);
  const mine = (m: CloudMessage) =>
    sector === 'admin' ? m.autor_papel === 'admin' : sides.includes(m.lado);
  const label = itemLabel(item.ord);

  return (
    <dialog
      ref={dialog}
      className="chat-sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="chat-head">
        <button
          type="button"
          className="chat-head__photo"
          aria-label={`Ver fotos do item ${label}`}
          disabled={!itemPaths.length}
          onClick={() => setViewing(itemPaths)}
        >
          {itemUrls[itemPaths[0]] ? (
            <img src={itemUrls[itemPaths[0]]} alt="" />
          ) : (
            <MessagesSquare />
          )}
        </button>
        <div className="chat-head__title">
          <h2 id={titleId}>
            Item <span className="mono">{label}</span>
          </h2>
          <p>{lotName}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Fechar conversa"
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      <dl className="chat-where" aria-label="Onde está o produto">
        <div>
          <dt>
            <MapPin />
            <span className="sr-only">Endereço</span>
          </dt>
          <dd className={item.address ? 'mono' : 'empty'}>
            {item.address ?? 'Sem endereço'}
          </dd>
        </div>
        {item.bombona && (
          <div>
            <dt>
              <Container />
              <span className="sr-only">Bombona</span>
            </dt>
            <dd className="mono">{item.bombona}</dd>
          </div>
        )}
        {item.weight_g ? (
          <div>
            <dt>
              <Scale />
              <span className="sr-only">Peso</span>
            </dt>
            <dd className="mono">{formatKg(item.weight_g)}</dd>
          </div>
        ) : null}
      </dl>

      <div className="chat-log" ref={scroller} aria-live="polite">
        {loadError && (
          <p className="chat-error" role="alert">
            {loadError}{' '}
            <button
              type="button"
              className="text-button"
              onClick={() => void reload()}
            >
              Tentar de novo
            </button>
          </p>
        )}
        {!messages && !loadError && (
          <p className="chat-loading">
            <LoaderCircle className="spin" />
            Abrindo conversa…
          </p>
        )}
        {messages && messages.length === 0 && (
          <div className="chat-empty">
            <MessagesSquare />
            {asks ? (
              <>
                <h3>Falta algo para achar o código?</h3>
                <p>
                  Peça ao almoxarifado uma medida, uma foto de um detalhe ou
                  pergunte o que precisar. Eles recebem o aviso no celular.
                </p>
              </>
            ) : (
              <>
                <h3>Nenhuma mensagem ainda.</h3>
                <p>
                  Quando a estrutura pedir algo sobre este item, aparece aqui.
                  Você também pode escrever para ela.
                </p>
              </>
            )}
          </div>
        )}
        {messages?.map((m, i) => {
          const day = dayLabel(m.criado_em);
          const showDay =
            i === 0 || dayLabel(messages[i - 1].criado_em) !== day;
          const own = mine(m);
          const sameAuthor =
            i > 0 &&
            !showDay &&
            messages[i - 1].lado === m.lado &&
            messages[i - 1].tipo !== 'pedido' &&
            m.tipo !== 'pedido';
          return (
            <Fragment key={m.id}>
              {showDay && (
                <p className="chat-day">
                  <span>{day}</span>
                </p>
              )}
              {m.tipo === 'pedido' ? (
                <RequestCard
                  m={m}
                  own={own}
                  canAnswer={answers && !closed}
                  canCancel={asks && !closed}
                  answering={mode.kind === 'answer' && mode.to.id === m.id}
                  onAnswer={() => setMode({ kind: 'answer', to: m })}
                  onCancel={async () => {
                    try {
                      await cancelRequest(m.id);
                      await reload();
                    } catch (e) {
                      notice(errorMessage(e), 'error');
                    }
                  }}
                />
              ) : (
                <Bubble
                  m={m}
                  own={own}
                  compact={sameAuthor}
                  quote={m.responde_a ? byId.get(m.responde_a) : undefined}
                  photo={m.foto ? urls[m.foto.path] : undefined}
                  onPhoto={() => m.foto && setViewing([m.foto.path])}
                />
              )}
            </Fragment>
          );
        })}
      </div>

      {closed ? (
        <p className="chat-closed">
          <CircleCheck />
          Item concluído. A conversa fica guardada para consulta.
        </p>
      ) : (
        <Composer
          key={mode.kind === 'answer' ? mode.to.id : mode.kind}
          item={item}
          mode={mode}
          asks={asks}
          answers={answers}
          openCount={open.length}
          coded={item.status !== 'pendente'}
          onMode={setMode}
          onSent={async (sent) => {
            // Já mostra o pedido respondido e passa para o próximo aberto.
            setMessages((list) =>
              list && !list.some((m) => m.id === sent.id)
                ? [
                    ...list.map((m) =>
                      m.id === sent.responde_a
                        ? { ...m, situacao: 'respondido' as const }
                        : m,
                    ),
                    sent,
                  ]
                : list,
            );
            setMode({ kind: 'text' });
            setPicked(false);
            await reload();
          }}
        />
      )}
      {viewing && (
        <ChatPhotos paths={viewing} onClose={() => setViewing(null)} />
      )}
    </dialog>
  );
}

function ChatPhotos({
  paths,
  onClose,
}: {
  paths: string[];
  onClose: () => void;
}) {
  const urls = usePhotoUrls(paths);
  return (
    <PhotoViewer srcs={paths.map((p) => urls[p] ?? '')} onClose={onClose} />
  );
}

function Author({ m, own }: { m: CloudMessage; own: boolean }) {
  return (
    <span className="chat-author">
      {own ? 'Você' : m.autor_nome}
      <span>
        {m.autor_papel === 'admin' ? 'Administrador' : sideLabel[m.lado]} ·{' '}
        {time.format(new Date(m.criado_em))}
      </span>
    </span>
  );
}

function RequestCard({
  m,
  own,
  canAnswer,
  canCancel,
  answering,
  onAnswer,
  onCancel,
}: {
  m: CloudMessage;
  own: boolean;
  canAnswer: boolean;
  canCancel: boolean;
  answering: boolean;
  onAnswer: () => void;
  onCancel: () => Promise<void>;
}) {
  const kind = m.pedido ?? 'info';
  const isOpen = m.situacao === 'aberto';
  const state =
    m.situacao === 'aberto'
      ? 'Aguardando o almoxarifado'
      : m.situacao === 'respondido'
        ? 'Respondido'
        : m.situacao === 'cancelado'
          ? 'Cancelado'
          : 'Não foi mais preciso';
  return (
    <article
      className={`chat-request ${kind} ${isOpen ? 'is-open' : 'is-closed'} ${answering ? 'is-answering' : ''}`}
    >
      <span className="chat-request__icon">{ASK[kind].icon}</span>
      <div className="chat-request__body">
        <p className="chat-request__kind">
          {kind === 'info'
            ? 'Pergunta'
            : `Pedido de ${requestLabel[kind].toLowerCase()}`}
        </p>
        <p className="chat-request__text">{m.texto}</p>
        <p className="chat-request__meta">
          <span className={`chat-state ${m.situacao}`}>{state}</span>
          <span>
            {own ? 'Você' : m.autor_nome} · {time.format(new Date(m.criado_em))}
          </span>
        </p>
      </div>
      {isOpen && (canAnswer || (canCancel && own)) && (
        <div className="chat-request__actions">
          {canAnswer && !answering && (
            <button type="button" className="accent" onClick={onAnswer}>
              Responder
            </button>
          )}
          {canCancel && own && !canAnswer && (
            <button
              type="button"
              className="text-button"
              onClick={() => void onCancel()}
            >
              Cancelar pedido
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function Bubble({
  m,
  own,
  compact,
  quote,
  photo,
  onPhoto,
}: {
  m: CloudMessage;
  own: boolean;
  compact: boolean;
  quote?: CloudMessage;
  photo?: string;
  onPhoto: () => void;
}) {
  return (
    <div
      className={`chat-msg ${own ? 'own' : 'other'} ${compact ? 'compact' : ''}`}
    >
      {!compact && <Author m={m} own={own} />}
      <div className={`chat-bubble ${m.tipo}`}>
        {quote && (
          <p className="chat-quote">
            <CornerDownRight />
            {quote.texto}
          </p>
        )}
        {m.medida !== null && m.unidade && (
          <p className="chat-measure mono">
            {formatMeasure(m.medida, m.unidade)}
          </p>
        )}
        {m.foto &&
          (photo ? (
            <button
              type="button"
              className="chat-photo"
              aria-label="Ampliar foto"
              onClick={onPhoto}
            >
              <img
                src={photo}
                alt=""
                decoding="async"
                style={{
                  aspectRatio:
                    m.foto.width && m.foto.height
                      ? `${m.foto.width} / ${m.foto.height}`
                      : undefined,
                }}
              />
            </button>
          ) : (
            <span className="chat-photo missing">Foto indisponível</span>
          ))}
        {m.texto && <p className="chat-text">{m.texto}</p>}
      </div>
      {compact && (
        <span className="chat-time">{time.format(new Date(m.criado_em))}</span>
      )}
    </div>
  );
}

function Composer({
  item,
  mode,
  asks,
  answers,
  openCount,
  coded,
  onMode,
  onSent,
}: {
  item: ChatItem;
  mode: Mode;
  asks: boolean;
  answers: boolean;
  openCount: number;
  coded: boolean;
  onMode: (mode: Mode) => void;
  onSent: (m: CloudMessage) => Promise<void>;
}) {
  const [text, setText] = useState(''),
    [value, setValue] = useState(''),
    [unit, setUnit] = useState<Unit>('mm'),
    [photo, setPhoto] = useState<Draft | null>(null),
    [shooting, setShooting] = useState(false),
    [processing, setProcessing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  const notice = useNotice();
  const blobs = useMemo(() => [photo?.blob], [photo]);
  const [preview] = useBlobUrls(blobs);
  // Lado de quem escreve neste modo (o administrador fala pelos dois).
  const lado: Side =
    mode.kind === 'ask'
      ? 'estrutura'
      : mode.kind === 'answer'
        ? 'almoxarifado'
        : answers && !asks
          ? 'almoxarifado'
          : asks && !answers
            ? 'estrutura'
            : 'almoxarifado';
  const answerKind = mode.kind === 'answer' ? (mode.to.pedido ?? 'info') : null;
  const measure = value.trim() ? parseMeasure(value) : NaN;
  const measureError =
    value.trim() && !(measure > 0 && measure < 1e7) ? 'Número inválido' : '';
  const ready =
    !busy &&
    !processing &&
    !measureError &&
    (mode.kind === 'ask'
      ? !!text.trim()
      : !!text.trim() || !!photo || (answerKind === 'medida' && measure > 0));

  async function addPhoto(blob: Blob) {
    setProcessing(true);
    setError('');
    try {
      setPhoto(await compressPhoto(blob));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProcessing(false);
    }
  }
  async function send() {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      const foto = photo ? await uploadChatPhoto(item, photo) : undefined;
      const sent = await sendMessage({
        item,
        lado,
        tipo:
          mode.kind === 'ask'
            ? 'pedido'
            : mode.kind === 'answer'
              ? 'resposta'
              : 'texto',
        pedido: mode.kind === 'ask' ? mode.pedido : undefined,
        respondeA: mode.kind === 'answer' ? mode.to.id : undefined,
        texto: text,
        medida: answerKind === 'medida' && measure > 0 ? measure : undefined,
        unidade: answerKind === 'medida' && measure > 0 ? unit : undefined,
        foto,
      });
      setText('');
      setValue('');
      setPhoto(null);
      if (mode.kind === 'ask')
        notice(
          'Pedido enviado. Você recebe o aviso quando responderem.',
          'success',
        );
      await onSent(sent);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const pick = (suggestion: string) => {
    setText((t) => {
      const clean = t.trim();
      if (!clean) return suggestion;
      if (
        clean
          .toLocaleLowerCase('pt-BR')
          .includes(suggestion.toLocaleLowerCase('pt-BR'))
      )
        return t;
      return `${clean}, ${suggestion.charAt(0).toLowerCase()}${suggestion.slice(1)}`;
    });
    input.current?.focus();
  };
  const photoTools = (big: boolean) => (
    <>
      {photo || processing ? (
        <figure className="chat-draft-photo">
          {preview ? (
            <img src={preview} alt="Foto a enviar" />
          ) : (
            <LoaderCircle className="spin" />
          )}
          <button
            type="button"
            className="photo-remove"
            aria-label="Remover foto"
            onClick={() => setPhoto(null)}
          >
            <X />
          </button>
        </figure>
      ) : big ? (
        <div className="chat-shoot">
          <button
            type="button"
            className="accent"
            onClick={() => setShooting(true)}
          >
            <Camera />
            Tirar foto
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => gallery.current?.click()}
          >
            <ImagePlus />
            Galeria
          </button>
        </div>
      ) : null}
    </>
  );

  return (
    <form
      className={`chat-compose mode-${mode.kind}`}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {mode.kind === 'text' && asks && !coded && (
        <div
          className="chat-asks"
          role="group"
          aria-label="Pedir ao almoxarifado"
        >
          {(Object.keys(ASK) as RequestKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onMode({ kind: 'ask', pedido: k })}
            >
              {ASK[k].icon}
              {ASK[k].verb}
            </button>
          ))}
        </div>
      )}
      {mode.kind === 'text' && answers && !asks && openCount > 0 && (
        <p className="chat-hint">
          {openCount === 1
            ? 'Há 1 pedido aberto. Toque em Responder no pedido.'
            : `Há ${openCount} pedidos abertos. Toque em Responder em cada um.`}
        </p>
      )}

      {mode.kind === 'ask' && (
        <div className="chat-panel">
          <div className="chat-panel__head">
            <div
              className="chat-tabs"
              role="tablist"
              aria-label="Tipo de pedido"
            >
              {(Object.keys(ASK) as RequestKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={mode.pedido === k}
                  onClick={() => onMode({ kind: 'ask', pedido: k })}
                >
                  {ASK[k].icon}
                  {requestLabel[k]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Cancelar pedido"
              onClick={() => onMode({ kind: 'text' })}
            >
              <X />
            </button>
          </div>
          <div className="chat-chips" aria-label="Sugestões">
            {SUGGESTIONS[mode.pedido].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={text
                  .toLocaleLowerCase('pt-BR')
                  .includes(s.toLocaleLowerCase('pt-BR'))}
                onClick={() => pick(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode.kind === 'answer' && (
        <div className="chat-panel answer">
          <div className="chat-panel__head">
            <p className="chat-panel__title">
              <CornerDownRight />
              <span>
                Respondendo
                <strong>{mode.to.texto}</strong>
              </span>
            </p>
            <button
              type="button"
              className="icon-button"
              aria-label="Escrever outra coisa"
              onClick={() => onMode({ kind: 'text' })}
            >
              <X />
            </button>
          </div>
          {answerKind === 'medida' && (
            <div className="chat-measure-entry">
              <label className="chat-measure-field">
                <span className="sr-only">Medida</span>
                <input
                  autoFocus
                  className="mono"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,0"
                  value={value}
                  aria-invalid={!!measureError}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <div
                className="chat-units"
                role="radiogroup"
                aria-label="Unidade"
              >
                {UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={unit === u}
                    onClick={() => setUnit(u)}
                  >
                    {u === 'pol' ? 'pol' : u}
                  </button>
                ))}
              </div>
            </div>
          )}
          {measureError && <p className="field-error">{measureError}</p>}
          {answerKind === 'foto' && photoTools(true)}
        </div>
      )}

      {answerKind !== 'foto' && (photo || processing) && photoTools(false)}

      <div className="chat-input">
        {mode.kind !== 'ask' && answerKind !== 'foto' && !photo && (
          <button
            type="button"
            className="icon-button"
            aria-label="Anexar foto"
            disabled={processing}
            onClick={() => setShooting(true)}
          >
            <Camera />
          </button>
        )}
        <textarea
          ref={input}
          rows={1}
          maxLength={500}
          autoFocus={mode.kind !== 'answer' || answerKind === 'info'}
          aria-label={
            mode.kind === 'ask'
              ? ASK[mode.pedido].hint
              : mode.kind === 'answer'
                ? 'Resposta'
                : 'Mensagem'
          }
          placeholder={
            mode.kind === 'ask'
              ? ASK[mode.pedido].hint
              : answerKind === 'info'
                ? 'Sua resposta'
                : answerKind
                  ? 'Observação (opcional)'
                  : 'Escreva uma mensagem'
          }
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 132)}px`;
          }}
          onKeyDown={(e) => {
            // Enter envia no computador; no celular o teclado quebra linha.
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              matchMedia('(pointer: fine)').matches
            ) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          className={mode.kind === 'text' ? 'chat-send' : 'chat-send primary'}
          aria-label={
            mode.kind === 'ask'
              ? ASK[mode.pedido].verb
              : mode.kind === 'answer'
                ? 'Enviar resposta'
                : 'Enviar mensagem'
          }
          disabled={!ready}
        >
          {busy ? <LoaderCircle className="spin" /> : <SendHorizontal />}
          {mode.kind !== 'text' && (
            <span>{mode.kind === 'ask' ? 'Pedir' : 'Responder'}</span>
          )}
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <input
        ref={camera}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void addPhoto(file);
          e.target.value = '';
        }}
      />
      <input
        ref={gallery}
        className="sr-only"
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-label="Escolher foto"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void addPhoto(file);
          e.target.value = '';
        }}
      />
      {shooting && (
        <PhotoCapture
          remaining={1}
          onPhoto={(blob) => void addPhoto(blob)}
          onClose={() => setShooting(false)}
          onFallback={() => {
            setShooting(false);
            camera.current?.click();
          }}
        />
      )}
    </form>
  );
}

/**
 * Faixa da conversa no cartão do item: pedido aberto, resposta nova ou a
 * última mensagem. Um toque abre a conversa.
 */
export function ChatStrip({
  item,
  sector,
  onOpen,
}: {
  item: ChatItem;
  sector: Sector;
  onOpen: () => void;
}) {
  if (!item.msg_count) return null;
  const waiting = (item.pedidos_abertos ?? 0) > 0;
  const unread = unreadFor(item, sector);
  const almoxView = sector !== 'estrutura';
  const tone = waiting ? (almoxView ? 'act' : 'wait') : unread ? 'new' : 'idle';
  const head = waiting
    ? almoxView
      ? 'Estrutura pediu ajuda'
      : 'Aguardando o almoxarifado'
    : unread
      ? `${item.ultima_msg_lado ? sideLabel[item.ultima_msg_lado] : 'Mensagem'} respondeu`
      : `Conversa · ${item.msg_count} ${item.msg_count === 1 ? 'mensagem' : 'mensagens'}`;
  return (
    <button type="button" className={`chat-strip ${tone}`} onClick={onOpen}>
      <span className="chat-strip__icon">
        {waiting ? <MessageCircleQuestion /> : <MessagesSquare />}
      </span>
      <span className="chat-strip__text">
        <strong>{head}</strong>
        {item.ultima_msg && <span>{item.ultima_msg}</span>}
      </span>
      {unread && !(waiting && almoxView) && (
        <span className="chat-dot" aria-label="Nova" />
      )}
      {waiting && almoxView && (
        <span className="chat-strip__cta">Responder</span>
      )}
    </button>
  );
}
