import { useState } from 'react';
import { Scale } from 'lucide-react';
import { Modal } from '../../components/ui';
import {
  catalogWeight,
  formatKg,
  parseGrams,
  setRecordWeight,
} from '../../core/weight';
import type { InventoryRecord } from '../../core/models';

/** Informa ou altera o peso unitário (g) de um registro. */
export function WeightDialog({
  record,
  onClose,
}: {
  record: InventoryRecord;
  onClose: (saved?: number | null) => void;
}) {
  const fromCatalog = catalogWeight(record.code);
  const [value, setValue] = useState(
      record.weight ? String(record.weight).replace('.', ',') : '',
    ),
    [busy, setBusy] = useState(false);
  const grams = parseGrams(value),
    invalid = value.trim() !== '' && grams === null;
  async function save(next: number | null) {
    setBusy(true);
    try {
      await setRecordWeight(record.id, next);
      onClose(next);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Peso do produto" onClose={() => onClose()}>
      <form
        className="weight-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) void save(grams);
        }}
      >
        <code className="weight-code">{record.code}</code>
        <label>
          Peso unitário
          <span className="weight-input">
            <Scale aria-hidden="true" />
            <input
              autoFocus
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              aria-invalid={invalid}
              value={value}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
            />
            <span>g</span>
          </span>
        </label>
        <p className={invalid ? 'form-error' : 'helper'}>
          {invalid
            ? 'Informe um peso maior que zero, ex.: 0,24'
            : grams
              ? `Na planilha: ${formatKg(grams)}`
              : 'Em gramas. Valores abaixo de 1 g são aceitos.'}
        </p>
        {fromCatalog !== undefined && (
          <button
            type="button"
            className="weight-catalog"
            onClick={() => setValue(String(fromCatalog).replace('.', ','))}
          >
            Localizador de materiais: {String(fromCatalog).replace('.', ',')} g
          </button>
        )}
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={() => onClose()}>
            Pular
          </button>
          <button className="primary" disabled={busy || invalid}>
            {busy ? 'Salvando…' : 'Salvar peso'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
