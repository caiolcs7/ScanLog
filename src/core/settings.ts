import { defaultSettings, type Settings } from './models';

const publishedProductDefaults = [
  '^IT[A-Z0-9]{3,62}$',
  '^[A-QS-Z][A-Z0-9]{1,63}$',
];
const publishedAddressDefaults = [
  '^R[0-9]{2,3}A[0-9]{1,3}C[0-9]{1,3}DP[0-9]{1,3}$',
  '^R[0-9]{2,3}B[0-9]{1,3}$',
];

/** Upgrade known published defaults without replacing customized rules. */
export function upgradeLegacySettings(settings: Settings): Settings {
  const productIsPublishedDefault =
    settings.rules.productPatterns.length === 1 &&
    publishedProductDefaults.includes(settings.rules.productPatterns[0]);
  const addressIsPublishedDefault =
    JSON.stringify(settings.rules.addressPatterns) ===
    JSON.stringify(publishedAddressDefaults);
  if (!productIsPublishedDefault && !addressIsPublishedDefault) return settings;
  return {
    ...settings,
    rules: {
      ...settings.rules,
      productPatterns: productIsPublishedDefault
        ? [...defaultSettings.rules.productPatterns]
        : settings.rules.productPatterns,
      addressPatterns: addressIsPublishedDefault
        ? [...defaultSettings.rules.addressPatterns]
        : settings.rules.addressPatterns,
    },
  };
}

/**
 * Padrões de etiqueta e normalização são fixos no código: não aparecem nas
 * Configurações e qualquer valor antigo salvo no aparelho é substituído.
 * Só "Preencher B com três dígitos" continua ajustável.
 */
export function withFixedRules(settings: Settings): Settings {
  return {
    ...settings,
    saveRaw: defaultSettings.saveRaw,
    rules: {
      ...structuredClone(defaultSettings.rules),
      padB: settings.rules?.padB ?? defaultSettings.rules.padB,
    },
  };
}
