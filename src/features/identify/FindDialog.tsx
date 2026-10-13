import { useMemo, useRef, useState } from 'react';
import {
  Camera,
  Container,
  ImagePlus,
  MapPin,
  MapPinOff,
  Scale,
  ScanLine,
  X,
} from 'lucide-react';
import { Modal, errorMessage, useNotice } from '../../components/ui';
import type { Settings } from '../../core/models';
import { MAX_PHOTOS } from '../../core/identify';
import { normalizeGalao, parseScan } from '../../core/parser';
import { formatKg, parseGrams } from '../../core/weight';
import { compressPhoto, makeThumbnail } from '../../services/photo';
import {
  photoPath,
  queueItem,
  thumbPath,
  type DraftPhoto,
} from '../../cloud/outbox';
import { useBlobUrls, usePhotoUrls } from '../../cloud/hooks';
import type { ItemView } from './items';
import { ScannerPanel } from '../scanner/ScannerPanel';
import { PhotoCapture } from './PhotoCapture';

/** Cadastro de um produto sem código: fotos, endereço opcional, bombona e peso. */
export function FindDialog({
  lotId,
  item,
  label,
  previous,
  settings,
  onClose,
}: {
  lotId: string;
  item: ItemView | null;
  label: string;
  /** Último item salvo: endereço e bombona costumam se repetir. */
  previous?: ItemView;
  settings: Settings;
  onClose: () => void;
}) {
  const base = item ?? previous;
  const [photos, setPhotos] = useState<DraftPhoto[]>(item?.draftPhotos ?? []),
    [withAddress, setWithAddress] = useState(!!base?.address),
    [address, setAddress] = useState(base?.address ?? ''),
    [bombona, setBombona] = useState(base?.bombona ?? ''),
    [weight, setWeight] = useState(
      item?.weight_g ? String(item.weight_g).replace('.', ',') : '',
    ),
    [note, setNote] = useState(item?.note ?? ''),
    [reading, setReading] = useState(false),
    [shooting, setShooting] = useState(false),
    [processing, setProcessing] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(0),
    [itemId, setItemId] = useState(item?.id ?? crypto.randomUUID());
  const camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null),
    notice = useNotice();
  const blobs = useMemo(() => photos.map((p) => p.blob), [photos]);
  const local = useBlobUrls(blobs),
    remote = usePhotoUrls(photos.filter((p) => !p.blob).map((p) => p.path));
  const urls = photos.map((p, i) => local[i] || remote[p.path] || '');
  const grams = parseGrams(weight),
    weightInvalid = weight.trim() !== '' && grams === null,
    free = MAX_PHOTOS - photos.length - processing;

  async function addBlobs(files: Blob[]) {
    const list = files.slice(0, Math.max(0, free));
    if (!list.length) return;
    setProcessing((n) => n + list.length);
    for (const file of list) {
      try {
        const photo = await compressPhoto(file);
        setPhotos((current) =>
          current.length < MAX_PHOTOS
            ? [...current, { ...photo, path: photoPath(lotId, itemId) }]
            : current,
        );
      } catch (e) {
        notice(errorMessage(e), 'error');
      } finally {
        setProcessing((n) => n - 1);
      }
    }
  }
  async function save(next: boolean) {
    setError('');
    setBusy(true);
    try {
      if (!photos.length) throw new Error('Tire ao menos uma foto.');
      const original = item?.draftPhotos ?? [];
      const kept = new Set(photos.map((p) => p.path));
      const removePaths = original
        .map((p) => p.path)
        .filter((p) => !kept.has(p));
      // Miniatura nova só quando a foto principal mudou.
      let thumb: { path: string; blob: Blob } | undefined;
      if (photos[0].blob && photos[0].path !== original[0]?.path) {
        const blob = await makeThumbnail(photos[0].blob);
        thumb = { path: thumbPath(lotId, itemId, blob), blob };
        if (item?.thumb_path) removePaths.push(item.thumb_path);
      }
      const cleanAddress = withAddress ? address.trim().toUpperCase() : '';
      await queueItem({
        lotId,
        itemId,
        isNew: !item,
        fields: {
          address: cleanAddress || null,
          bombona: normalizeGalao(bombona) || null,
          weight_g: grams ?? null,
          note: note.trim() || null,
        },
        photos,
        thumb,
        removePaths,
      });
      if (next) {
        // Mesmo endereço e bombona: o próximo produto costuma estar ao lado.
        setPhotos([]);
        setWeight('');
        setNote('');
        setItemId(crypto.randomUUID());
        setSaved((n) => n + 1);
        notice('Produto salvo. Pode fotografar o próximo.', 'success');
      } else onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title={item ? `Editar item ${label}` : 'Produto sem código'}
      onClose={onClose}
    >
      <form
        className="find-form"
        key={saved}
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <fieldset className="find-photos">
          <legend>
            Fotos{' '}
            <span>
              {photos.length}/{MAX_PHOTOS}
            </span>
          </legend>
          <div className="photo-grid">
            {photos.map((photo, i) => (
              <figure className="photo-slot filled" key={photo.path}>
                {urls[i] ? (
                  <img src={urls[i]} alt={`Foto ${i + 1}`} />
                ) : (
                  <span className="photo-slot__wait" />
                )}
                {i === 0 && <figcaption>Principal</figcaption>}
                <button
                  type="button"
                  className="photo-remove"
                  aria-label={`Remover foto ${i + 1}`}
                  onClick={() =>
                    setPhotos((current) => current.filter((_, j) => j !== i))
                  }
                >
                  <X />
                </button>
              </figure>
            ))}
            {Array.from({ length: processing }, (_, i) => (
              <div className="photo-slot loading" key={`p${i}`} />
            ))}
            {free > 0 && (
              <button
                type="button"
                className="photo-slot add"
                onClick={() => setShooting(true)}
              >
                <Camera />
                <span>{photos.length ? 'Outro ângulo' : 'Tirar foto'}</span>
              </button>
            )}
          </div>
          <div className="photo-tools">
            <p className="helper">
              {photos.length
                ? 'Etiqueta, frente e detalhes ajudam a achar o código.'
                : 'Fotografe o produto inteiro e qualquer marcação visível.'}
            </p>
            <button
              type="button"
              className="text-button"
              disabled={free <= 0}
              onClick={() => gallery.current?.click()}
            >
              <ImagePlus />
              Galeria
            </button>
          </div>
          {/* Último recurso, se o navegador não liberar a câmera no app. */}
          <input
            ref={camera}
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            tabIndex={-1}
            onChange={(e) => {
              void addBlobs([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <input
            ref={gallery}
            className="sr-only"
            type="file"
            accept="image/*"
            multiple
            tabIndex={-1}
            onChange={(e) => {
              void addBlobs([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </fieldset>

        <div className="find-fields">
          <div className="find-address">
            <div className="segmented" role="radiogroup" aria-label="Endereço">
              <button
                type="button"
                role="radio"
                aria-checked={!withAddress}
                onClick={() => setWithAddress(false)}
              >
                <MapPinOff />
                Sem endereço
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={withAddress}
                onClick={() => setWithAddress(true)}
              >
                <MapPin />
                Com endereço
              </button>
            </div>
            {withAddress && (
              <div className="address-entry">
                <input
                  aria-label="Endereço"
                  className="mono"
                  placeholder="R07A1C01DP01"
                  autoComplete="off"
                  maxLength={128}
                  value={address}
                  onChange={(e) => setAddress(e.target.value.toUpperCase())}
                />
                <button
                  type="button"
                  className="accent"
                  onClick={() => setReading(true)}
                >
                  <ScanLine />
                  Ler
                </button>
              </div>
            )}
          </div>
          <div className="find-pair">
            <label>
              Bombona
              <span className="field-icon">
                <Container aria-hidden="true" />
                <input
                  className="mono"
                  placeholder="R15G03"
                  autoComplete="off"
                  maxLength={32}
                  value={bombona}
                  onChange={(e) => setBombona(e.target.value.toUpperCase())}
                />
              </span>
            </label>
            <label>
              Peso unitário
              <span className="field-icon">
                <Scale aria-hidden="true" />
                <input
                  className="mono"
                  inputMode="decimal"
                  placeholder="0,00"
                  autoComplete="off"
                  aria-invalid={weightInvalid}
                  value={weight}
                  onChange={(e) =>
                    setWeight(e.target.value.replace(/[^\d.,]/g, ''))
                  }
                />
                <span className="unit">g</span>
              </span>
              <small className={weightInvalid ? 'field-error' : 'helper'}>
                {weightInvalid
                  ? 'Peso inválido, ex.: 0,24'
                  : grams
                    ? `Na planilha: ${formatKg(grams)}`
                    : 'Em gramas.'}
              </small>
            </label>
          </div>
          <label>
            Observação <span className="optional">opcional</span>
            <input
              placeholder="Ex.: conector azul, 3 vias"
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            {saved && !item ? 'Concluir' : 'Cancelar'}
          </button>
          {!item && (
            <button
              type="button"
              disabled={busy || !photos.length || weightInvalid || !!processing}
              onClick={() => void save(true)}
            >
              Salvar e próximo
            </button>
          )}
          <button
            className="primary"
            disabled={busy || !photos.length || weightInvalid || !!processing}
          >
            {busy ? 'Salvando…' : item ? 'Salvar alterações' : 'Salvar'}
          </button>
        </div>
      </form>
      {shooting && (
        <PhotoCapture
          remaining={free}
          onPhoto={(blob) => void addBlobs([blob])}
          onClose={() => setShooting(false)}
          onFallback={() => {
            setShooting(false);
            camera.current?.click();
          }}
        />
      )}
      {reading && (
        <Modal wide title="Ler endereço" onClose={() => setReading(false)}>
          <ScannerPanel
            settings={settings}
            blocked={false}
            onScan={async (raw) => {
              const parsed = parseScan(raw, settings.rules);
              if (parsed.type !== 'address') {
                notice(
                  'Isso não é um endereço. Leia a etiqueta da posição.',
                  'error',
                );
                return;
              }
              setAddress(parsed.normalized);
              setReading(false);
              notice(`Endereço ${parsed.normalized}`, 'success');
            }}
          />
        </Modal>
      )}
    </Modal>
  );
}
