export type LotStatus = 'rascunho' | 'enviado' | 'codificado' | 'confirmado';
export type ItemStatus =
  'pendente' | 'codificado' | 'sem_codigo' | 'confirmado';
export type CloudPhoto = { path: string; width: number; height: number };
export type CloudLot = {
  id: string;
  name: string;
  status: LotStatus;
  item_count: number;
  coded_count: number;
  confirmed_count: number;
  created_at: string;
  created_by: string;
  sent_at: string | null;
  coded_at: string | null;
  confirmed_at: string | null;
  updated_at: string;
};
export type CloudItem = {
  id: string;
  lot_id: string;
  ord: number;
  status: ItemStatus;
  address: string | null;
  bombona: string | null;
  weight_g: number | null;
  note: string | null;
  photos: CloudPhoto[];
  thumb_path: string | null;
  created_at: string;
  created_by: string;
  code: string | null;
  code_note: string | null;
  coded_at: string | null;
  coded_by: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  photos_deleted_at: string | null;
  thumb_expires_at: string | null;
  updated_at: string;
};
export const lotStatusLabel: Record<LotStatus, string> = {
  rascunho: 'Em cadastro',
  enviado: 'Na estrutura',
  codificado: 'Para conferir',
  confirmado: 'Concluído',
};
export const itemStatusLabel: Record<ItemStatus, string> = {
  pendente: 'Pendente',
  codificado: 'Codificado',
  sem_codigo: 'Sem código',
  confirmado: 'Confirmado',
};
