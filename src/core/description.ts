/**
 * Extracts the printed product description from OCR text of a label.
 * Layout: the product code line, then one or more description lines, then the
 * symbol/Data Matrix area, which OCR renders as noise.
 */
const LOOKALIKE: Record<string, string> = {
  O: '0',
  Q: '0',
  I: '1',
  L: '1',
  S: '5',
  B: '8',
  Z: '2',
};
function skeleton(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[OQILSBZ]/g, (c) => LOOKALIKE[c]);
}
function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length];
}
function clean(line: string) {
  return line
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 .,/()%+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function isText(raw: string, line: string) {
  const letters = (line.match(/[A-Z]/g) ?? []).length;
  const words = line.split(' ').filter((w) => /[A-Z]{2,}/.test(w)).length;
  const kept =
    line.replace(/ /g, '').length / Math.max(1, raw.replace(/\s/g, '').length);
  return (
    letters >= 4 && words >= 1 && kept >= 0.85 && letters / line.length >= 0.45
  );
}
function isCode(line: string, code: string) {
  const a = skeleton(line),
    b = skeleton(code);
  if (!b || a.length < b.length - 2) return false;
  return (
    a.includes(b) || distance(a, b) <= Math.max(1, Math.floor(b.length / 6))
  );
}
export function extractDescription(ocrText: string, code: string): string {
  const lines = ocrText
    .split(/\r?\n/)
    .map((raw) => ({ raw, text: clean(raw) }))
    .filter((l) => l.text);
  const codeIndex = lines.findIndex((l) => isCode(l.text, code));
  const out: string[] = [];
  for (const line of lines.slice(codeIndex + 1)) {
    if (isCode(line.text, code)) continue;
    if (!isText(line.raw, line.text)) {
      if (out.length) break;
      continue;
    }
    out.push(line.text);
    if (out.length === 3) break;
  }
  return out.join(' ').slice(0, 300).trim();
}
