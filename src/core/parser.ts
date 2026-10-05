import type { ParsedScan, Rules } from './models';

const GROUP_SEPARATOR = String.fromCharCode(29);

// Bounded patterns prevent catastrophic backtracking in operator-supplied rules.
export function validatePattern(pattern: string): boolean {
  if (
    pattern.length > 160 ||
    !pattern.startsWith('^') ||
    !pattern.endsWith('$')
  )
    return false;
  if (/[()*+|\\]/.test(pattern)) return false;
  if (
    [...pattern.matchAll(/\{(\d+)(?:,(\d+))?\}/g)].some(
      (m) => Number(m[1]) > 128 || Number(m[2] ?? m[1]) > 128,
    )
  )
    return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
export function validateRules(rules: Rules): void {
  if (
    ![...rules.productPatterns, ...rules.addressPatterns].every(validatePattern)
  )
    throw new Error(
      'Use padrões com ^ e $, letras, números, classes [A-Z] e quantificadores limitados {1,64}. Grupos, barras e repetições abertas não são aceitos.',
    );
}
export function cleanText(raw: string): string {
  return raw
    .normalize('NFKC')
    .trim()
    .replace(/[\p{Cc}\p{Cf}\p{Z}\s]/gu, '')
    .replace(/^\](?:d[12]|Q[123]|C[01])/i, '')
    .toUpperCase();
}
function cleanKeepingGroupSeparator(raw: string): string {
  return raw
    .normalize('NFKC')
    .trim()
    .replace(/\p{Cc}/gu, (character) =>
      character === GROUP_SEPARATOR ? character : '',
    )
    .replace(/[\p{Cf}\p{Z}\s]/gu, '')
    .replace(/^\](?:d[12]|Q[123]|C[01])/i, '')
    .toUpperCase();
}
function unwrapGs1(raw: string): string | null {
  const value = cleanKeepingGroupSeparator(raw);
  const hri = /^\(251\)(.+?)\(37\)[0-9]+$/.exec(value);
  if (hri) return cleanText(hri[1]);
  const withoutLeadingSeparator = value.startsWith(GROUP_SEPARATOR)
    ? value.slice(1)
    : value;
  if (withoutLeadingSeparator.startsWith('251')) {
    const separator = withoutLeadingSeparator.indexOf(GROUP_SEPARATOR, 3);
    if (
      separator > 3 &&
      /^37[0-9]+$/.test(withoutLeadingSeparator.slice(separator + 1))
    )
      return cleanText(withoutLeadingSeparator.slice(3, separator));
  }
  const escaped = /^251(.+?)<GS>37[0-9]+$/.exec(withoutLeadingSeparator);
  if (escaped) return cleanText(escaped[1]);
  // Some keyboard-mode scanners render both FNC1 controls as visible squares,
  // leaving the exact compact form 251<product>371 after control cleanup.
  const hasScannerControl = [2, 3, 29, 30].some((code) =>
    raw.includes(String.fromCharCode(code)),
  );
  const compact = hasScannerControl
    ? /^251([A-Z0-9._/-]{1,122})371$/.exec(cleanText(raw))
    : null;
  return compact ? cleanText(compact[1]) : null;
}
function isWarehouseAddress(value: string): boolean {
  // Physical location labels use R + street + A + floor, followed by an
  // alphanumeric location block. This recognizes labels such as:
  // R06A1C06DP01, R07A1GHBEG01 and R07A1AVFEG01 independently of
  // address rules persisted by older app versions.
  return (
    /^R[0-9]{2,3}A[0-9]{1,3}[A-Z0-9]{1,120}$/.test(value) ||
    /^R[0-9]{2,3}B[0-9]{1,3}$/.test(value)
  );
}
function matchesAddress(value: string, rules: Rules): boolean {
  return (
    isWarehouseAddress(value) ||
    rules.addressPatterns.some((p) => new RegExp(p).test(value))
  );
}
function classify(value: string, rules: Rules): ParsedScan['type'] {
  const address = matchesAddress(value, rules);
  const product = rules.productPatterns.some((p) => new RegExp(p).test(value));
  // Location rules are intentionally more specific than the unrestricted
  // product rule. A complete warehouse address therefore always wins.
  return address ? 'address' : product ? 'product' : 'unknown';
}
function normalizeStructuredAddress(raw: string, rules: Rules): string | null {
  const compact = cleanText(raw).replace(/[^A-Z0-9]/g, '');
  if (!/^R[0-9]{2,3}/.test(compact)) return null;
  return matchesAddress(compact, rules) ? compact : null;
}

export function parseScan(raw: string, rules: Rules): ParsedScan {
  const invalid = (normalized: string, error: string): ParsedScan => ({
    raw,
    normalized,
    type: 'unknown',
    valid: false,
    warnings: [],
    error,
  });
  if (raw.length > 2048)
    return invalid('', 'Leitura longa demais. Leia uma única etiqueta.');
  try {
    validateRules(rules);
  } catch (error) {
    return invalid('', String(error));
  }
  const warnings: string[] = [];
  const gs1Payload = unwrapGs1(raw);
  const structuredAddress = gs1Payload
    ? null
    : normalizeStructuredAddress(raw, rules);
  let normalized = gs1Payload ?? structuredAddress ?? cleanText(raw);
  if (gs1Payload) warnings.push('Identificadores GS1 removidos.');
  else if (structuredAddress && structuredAddress !== cleanText(raw))
    warnings.push('Separadores da etiqueta de endereço removidos.');

  // Address labels include the warehouse/site prefix before a semicolon,
  // for example A1;R02A1C01EP02. Keep only the structured location payload.
  const addressEnvelope = /^[^;]{1,20};(.+)$/.exec(normalized);
  if (addressEnvelope && matchesAddress(addressEnvelope[1], rules)) {
    normalized = addressEnvelope[1];
    warnings.push('Prefixo da etiqueta de endereço removido.');
  }

  const candidates = new Set<string>();
  for (const wrapper of rules.wrappers) {
    const prefix = cleanText(wrapper.prefix),
      suffix = cleanText(wrapper.suffix);
    if (
      !prefix ||
      !suffix ||
      normalized.length <= prefix.length + suffix.length
    )
      continue;
    if (normalized.startsWith(prefix) && normalized.endsWith(suffix)) {
      const payload = normalized.slice(prefix.length, -suffix.length);
      if (payload) candidates.add(payload);
    }
  }
  if (candidates.size > 1)
    return invalid(
      normalized.slice(0, 128),
      'Wrapper ambíguo. A leitura não foi alterada; revise as regras.',
    );
  if (candidates.size === 1) {
    normalized = [...candidates][0];
    warnings.push('Wrapper configurado removido.');
  }
  if (
    !normalized ||
    normalized.length > 128 ||
    !/^[A-Z0-9._/-]+$/.test(normalized)
  )
    return invalid(
      normalized.slice(0, 128),
      'Código vazio ou com caracteres incompatíveis. Leia novamente.',
    );
  const type = classify(normalized, rules);
  if (type === 'unknown')
    return invalid(
      normalized,
      'Código desconhecido ou ambíguo. Confira a etiqueta e os padrões em Configurações.',
    );
  if (
    type === 'address' &&
    rules.padB &&
    /^R[0-9]{2,3}B[0-9]{1,3}$/.test(normalized)
  ) {
    const padded = normalized.replace(
      /B([0-9]{1,3})$/,
      (_, n: string) => `B${n.padStart(3, '0')}`,
    );
    if (padded !== normalized)
      warnings.push(
        'Endereço B preenchido com 3 dígitos, conforme configuração.',
      );
    normalized = padded;
  }
  return { raw, normalized, type, valid: true, warnings };
}
export function extractStreet(address: string): string {
  return /^R[0-9]+(?=[A-Z]|$)/.exec(address)?.[0] ?? 'Sem rua';
}
export function searchText(value: string): string {
  return cleanText(value);
}
/**
 * Galão labels identify the storage container (e.g. R16G01). They hold many
 * products, so a scanned galão becomes sticky context, like the address.
 */
export function parseGalao(raw: string): string | null {
  const value = cleanText(raw).replace(/[^A-Z0-9]/g, '');
  return /^R[0-9]{1,3}G[0-9]{1,3}$/.test(value) ? value : null;
}
/** Manual galão entry: any short alphanumeric identifier. */
export function normalizeGalao(raw: string): string {
  const value = cleanText(raw).replace(/[^A-Z0-9._/-]/g, '');
  if (value.length > 32) throw new Error('Galão com até 32 caracteres.');
  return value;
}
