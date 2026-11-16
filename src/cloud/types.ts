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
  /** Itens com pedido esperando o almoxarifado. */
  pedidos_abertos?: number;
  /** Itens com mensagem nova para cada setor. */
  novas_almox?: number;
  novas_estrutura?: number;
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
  /** Resumo da conversa, mantido pelo banco. */
  msg_count?: number;
  pedidos_abertos?: number;
  ultima_msg?: string | null;
  ultima_msg_em?: string | null;
  ultima_msg_lado?: Side | null;
  lido_almox_em?: string | null;
  lido_estrutura_em?: string | null;
};

/** Conversa do item: lado de quem fala, nunca o papel da conta. */
export type Side = 'almoxarifado' | 'estrutura';
export type MessageKind = 'pedido' | 'resposta' | 'texto';
export type RequestKind = 'medida' | 'foto' | 'info';
export type Unit = 'mm' | 'cm' | 'm' | 'pol' | 'g' | 'kg';
export type CloudMessage = {
  id: string;
  item_id: string;
  lot_id: string;
  lado: Side;
  autor_papel: 'almoxarifado' | 'estrutura' | 'admin';
  autor_nome: string;
  tipo: MessageKind;
  pedido: RequestKind | null;
  texto: string | null;
  medida: number | null;
  unidade: Unit | null;
  foto: CloudPhoto | null;
  responde_a: string | null;
  situacao: 'aberto' | 'respondido' | 'dispensado' | 'cancelado' | null;
  fechado_em: string | null;
  criado_em: string;
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
