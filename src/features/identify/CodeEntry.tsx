import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  Container,
  MapPin,
  Scale,
  ScanLine,
} from 'lucide-react';
import { Modal, errorMessage, useNotice } from '../../components/ui';
import type { Settings } from '../../core/models';
import { itemLabel } from '../../core/identify';
import { parseScan } from '../../core/parser';
import { formatKg } from '../../core/weight';
import { setCode, setNoCode } from '../../cloud/api';
import { usePhotoUrls } from '../../cloud/hooks';
import { itemStatusLabel } from '../../cloud/types';
import { ScannerPanel } from '../scanner/ScannerPanel';
import { fullDate, type ItemView } from './items';

/** Valida o código digitado ou lido com as mesmas regras do levantamento. */
export function checkCode(raw: string, settings: Settings) {
  const parsed = parseScan(raw, settings.rules);
  if (!parsed.normalized) return { error: 'Informe o código.' };
  if (parsed.type === 'address')
    return { error: 'Isso é um endereço. Informe o código do produto.' };
  if (parsed.type !== 'product' || !parsed.valid)
    return { error: parsed.error ?? 'Código inválido.' };
  return { code: parsed.normalized };
}

/**
 * Estrutura: um item por tela, foto grande e o campo de código em foco.
 * Enter salva e vai para o próximo pendente.
 */
export function CodeEntry({
  items,
  startId,
  settings,
  onClose,
}: {
  items: ItemView[];
  startId: string;
  settings: Settings;
  onClose: () => void;
}) {
  // Lista fixa ao abrir: o item salvo não some debaixo do dedo.
  const [list] = useState(items);
  const [index, setIndex] = useState(() =>
      Math.max(
        0,
        list.findIndex((i) => i.id === startId),
      ),
    ),
    [codes, setCodes] = useState<Record<string, string>>({}),
    [done, setDone] = useState<Record<string, ItemView['status']>>({}),
    [noCode, setNoCodeOpen] = useState(false),
    [reason, setReason] = useState(''),
    [zoom, setZoom] = useState<string | null>(null),
    [reading, setReading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const notice = useNotice();
  const input = useRef<HTMLInputElement>(null);
  const item = list[index];
  const paths = useMemo(
    () =>
      item.photos.length
        ? item.photos.map((p) => p.path)
        : item.thumb_path
          ? [item.thumb_path]
          : [],
    [item],
  );
  const urls = usePhotoUrls(paths);
  const value = codes[item.id] ?? item.code ?? '';
  useEffect(() => {
    setError('');
    setNoCodeOpen(false);
    setReason(
      item.code_note && item.status === 'sem_codigo' ? item.code_note : '',
    );
    input.current?.focus();
  }, [item]);
  const status = done[item.id] ?? item.status;
  function advance() {
    const next = list.findIndex(
      (i, j) => j > index && (done[i.id] ?? i.status) === 'pendente',
    );
    const wrap = list.findIndex(
      (i, j) => j !== index && (done[i.id] ?? i.status) === 'pendente',
    );
    const target = next >= 0 ? next : wrap;
    if (target >= 0) setIndex(target);
    else {
      notice('Todos os itens do lote foram preenchidos.', 'success');
      onClose();
    }
  }
  async function save(raw = value) {
    const result = checkCode(raw, settings);
    if (result.error) {
      setError(result.error);
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await setCode(item, result.code!);
      setCodes((c) => ({ ...c, [item.id]: result.code! }));
      setDone((d) => ({ ...d, [item.id]: 'codificado' }));
      advance();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveNoCode() {
    setBusy(true);
    setError('');
    try {
      await setNoCode(item, reason);
      setDone((d) => ({ ...d, [item.id]: 'sem_codigo' }));
      advance();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const pendingCount = list.filter(
    (i) => (done[i.id] ?? i.status) === 'pendente',
  ).length;
  return (
    <Modal
      wide
      title={`Item ${itemLabel(item.ord)} · ${pendingCount} pendente${pendingCount === 1 ? '' : 's'}`}
      onClose={onClose}
    >
      <div className="code-entry">
        <div className={`code-photos n${Math.min(paths.length, 4)}`}>
          {paths.map((path, i) =>
            urls[path] ? (
              <button
                key={path}
                type="button"
                aria-label={`Ampliar foto ${i + 1}`}
                onClick={() => setZoom(urls[path])}
              >
                <img src={urls[path]} alt={`Foto ${i + 1}`} decoding="async" />
              </button>
            ) : (
              <span key={path} className="photo-slot loading" />
            ),
          )}
          {!paths.length && <p className="helper">Sem foto disponível.</p>}
        </div>
        <div className="code-side">
          <span className={`status item-${status}`}>
            {itemStatusLabel[status]}
          </span>
          <dl className="find-facts">
            <div>
              <dt>
                <MapPin />
                Endereço
              </dt>
              <dd className={item.address ? 'mono' : 'empty'}>
                {item.address ?? 'Sem endereço'}
              </dd>
            </div>
            <div>
              <dt>
                <Container />
                Bombona
              </dt>
              <dd className={item.bombona ? 'mono' : 'empty'}>
                {item.bombona ?? '—'}
              </dd>
            </div>
            <div>
              <dt>
                <Scale />
                Peso
              </dt>
              <dd className={item.weight_g ? 'mono' : 'empty'}>
                {item.weight_g ? formatKg(item.weight_g) : '—'}
              </dd>
            </div>
          </dl>
          {item.note && <p className="find-note">{item.note}</p>}
          {item.code_note && item.status === 'pendente' && (
            <p className="find-note code-note">Devolvido: {item.code_note}</p>
          )}
          <p className="helper">
            Cadastrado em {fullDate(item.created_at)} por {item.created_by}
          </p>
          {noCode ? (
            <form
              className="code-form"
              onSubmit={(e) => {
                e.preventDefault();
                void saveNoCode();
              }}
            >
              <label>
                Por que está sem código?
                <input
                  autoFocus
                  required
                  maxLength={500}
                  value={reason}
                  placeholder="Ex.: material não cadastrado"
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <div className="code-actions">
                <button type="button" onClick={() => setNoCodeOpen(false)}>
                  Voltar
                </button>
                <button className="primary" disabled={busy || !reason.trim()}>
                  <Ban />
                  Salvar sem código
                </button>
              </div>
            </form>
          ) : (
            <form
              className="code-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label>
                CODIGO
                <span className="address-entry">
                  <input
                    ref={input}
                    className="mono code-input"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    enterKeyHint="next"
                    maxLength={128}
                    value={value}
                    aria-invalid={!!error}
                    onChange={(e) =>
                      setCodes((c) => ({
                        ...c,
                        [item.id]: e.target.value.toUpperCase(),
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="accent"
                    onClick={() => setReading(true)}
                  >
                    <ScanLine />
                    Ler
                  </button>
                </span>
              </label>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <div className="code-actions">
                <button
                  type="button"
                  aria-label="Item anterior"
                  disabled={index === 0}
                  onClick={() => setIndex(index - 1)}
                >
                  <ArrowLeft />
                </button>
                <button type="button" onClick={() => setNoCodeOpen(true)}>
                  <Ban />
                  Sem código
                </button>
                <button
                  type="button"
                  aria-label="Próximo item"
                  disabled={index === list.length - 1}
                  onClick={() => setIndex(index + 1)}
                >
                  <ArrowRight />
                </button>
                <button className="primary" disabled={busy || !value.trim()}>
                  <Check />
                  {busy ? 'Salvando…' : 'Salvar e próximo'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      {zoom && (
        <button
          type="button"
          className="photo-zoom"
          aria-label="Fechar foto"
          onClick={() => setZoom(null)}
        >
          <img src={zoom} alt="Foto ampliada" />
        </button>
      )}
      {reading && (
        <Modal wide title="Ler código" onClose={() => setReading(false)}>
          <ScannerPanel
            settings={settings}
            blocked={false}
            onScan={async (raw) => {
              const result = checkCode(raw, settings);
              if (result.error) {
                notice(result.error, 'error');
                return;
              }
              setReading(false);
              setCodes((c) => ({ ...c, [item.id]: result.code! }));
            }}
          />
        </Modal>
      )}
    </Modal>
  );
}
