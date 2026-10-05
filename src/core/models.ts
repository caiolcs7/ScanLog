import { z } from 'zod';

export const rulesSchema = z.object({
  productPatterns: z.array(z.string().max(160)).min(1).max(20),
  addressPatterns: z.array(z.string().max(160)).min(1).max(20),
  padB: z.boolean(),
  wrappers: z
    .array(
      z.object({
        prefix: z.string().min(1).max(20),
        suffix: z.string().min(1).max(20),
      }),
    )
    .max(10),
});
export const settingsSchema = z.object({
  id: z.literal('main'),
  sound: z.boolean(),
  vibration: z.boolean(),
  cameraId: z.string().max(500),
  autoTorch: z.boolean(),
  cameraCapture: z.enum(['button', 'continuous']).default('button'),
  mode: z.enum(['fixed', 'product-address', 'address-product']),
  input: z.enum(['camera', 'hid']),
  duplicates: z.boolean(),
  saveRaw: z.boolean(),
  readDescription: z.boolean().default(false),
  autoGalao: z.boolean().default(false),
  galaoStart: z.number().int().min(1).max(999).default(1),
  theme: z.enum(['light', 'dark', 'system']),
  exportFormat: z.enum(['xlsx', 'csv']),
  rules: rulesSchema,
});
export type Settings = z.infer<typeof settingsSchema>;
export type Rules = z.infer<typeof rulesSchema>;
export type ScanMode = Settings['mode'];
export const defaultSettings: Settings = {
  id: 'main',
  sound: true,
  vibration: true,
  cameraId: '',
  autoTorch: false,
  cameraCapture: 'button',
  mode: 'fixed',
  input: 'camera',
  duplicates: true,
  saveRaw: false,
  readDescription: false,
  autoGalao: false,
  galaoStart: 1,
  theme: 'light',
  exportFormat: 'xlsx',
  rules: {
    // Any non-empty normalized value is accepted as a product. Complete
    // warehouse locations are classified first by the specific rules below.
    productPatterns: ['^[A-Z0-9._/-]{1,128}$'],
    addressPatterns: [
      // Keep the standard C/DP or C/EP locations valid while also accepting
      // alternative location blocks such as R07A1GHBEG01 and R07A1AVFEG01.
      '^R[0-9]{2,3}A[0-9]{1,3}[A-Z0-9]{1,120}$',
      '^R[0-9]{2,3}B[0-9]{1,3}$',
    ],
    padB: false,
    wrappers: [],
  },
};
export const sourceSchema = z.enum(['camera', 'hid', 'image', 'manual']);
export type Source = z.infer<typeof sourceSchema>;
const code = z.string().min(1).max(128);
export const sessionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  status: z.enum(['active', 'completed', 'archived']),
  notes: z.string().max(2000),
  count: z.number().int().nonnegative(),
  nextOrder: z.number().int().positive(),
  activeAddress: z.string().max(128),
  activeGalao: z.string().max(32).default(''),
  mode: z.enum(['fixed', 'product-address', 'address-product']),
  pending: z
    .object({
      type: z.enum(['product', 'address']),
      value: code,
      raw: z.string().max(2048).optional(),
      source: sourceSchema,
    })
    .nullable(),
  completedAddresses: z.array(code).max(100000),
});
export type Session = z.infer<typeof sessionSchema>;
export const recordSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  code,
  address: code,
  timestamp: z.number().finite(),
  order: z.number().int().positive(),
  source: sourceSchema,
  rawScan: z.string().max(2048).optional(),
  galao: z.string().max(32).optional(),
  galaoGroup: z.string().max(64).optional(),
  description: z.string().max(300).optional(),
});
export type InventoryRecord = z.infer<typeof recordSchema>;
export const historySchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  timestamp: z.number().finite(),
  normalized: z.string().max(128),
  raw: z.string().max(2048).optional(),
  source: sourceSchema,
  outcome: z.string().max(240),
});
export type ScanHistory = z.infer<typeof historySchema>;
export type ParsedScan = {
  raw: string;
  normalized: string;
  type: 'product' | 'address' | 'unknown';
  valid: boolean;
  warnings: string[];
  error?: string;
};
