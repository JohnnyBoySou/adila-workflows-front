/**
 * Schema declarativo de configuração por tipo de nó.
 *
 * Cada nó executável (e os dois visuais, sticky_note/container) registra
 * um `NodeConfigSchema` com a lista de `FieldDef` que descrevem os
 * campos a editar. O dialog genérico (`NodeConfigDialog`) renderiza
 * qualquer schema lendo/escrevendo um único objeto `values`.
 *
 * Os valores escritos pelo dialog vão direto para `node.data` no React
 * Flow — a serialização (`definition.ts`) já cuida de copiar tudo em
 * `node.config` (preservando `_editor` e título/descrição/variant).
 */
export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "kv"
  | "json"
  | "code"
  | "stringList";

export interface SelectOption {
  value: string;
  label: string;
}

export interface BaseFieldDef {
  /** Chave dentro do objeto `values` (ex: "url", "headers", "operation"). */
  name: string;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  /**
   * Permite condicionar a exibição do campo a outros valores — usado
   * por nós discriminados por `operation` (date_time, crypto, item_lists,
   * aggregate, vector_store, chat_memory, redis, wait).
   */
  visibleWhen?: (values: Record<string, unknown>) => boolean;
}

export type FieldDef =
  | (BaseFieldDef & { type: "text" })
  | (BaseFieldDef & { type: "textarea"; rows?: number })
  | (BaseFieldDef & { type: "number"; min?: number; max?: number; step?: number })
  | (BaseFieldDef & { type: "boolean" })
  | (BaseFieldDef & { type: "select"; options: SelectOption[] })
  | (BaseFieldDef & { type: "kv" })
  | (BaseFieldDef & { type: "json" })
  | (BaseFieldDef & { type: "code"; language?: "js" | "sql" })
  | (BaseFieldDef & { type: "stringList" });

/**
 * Painel customizado: substitui o renderer genérico (`FieldsList`) por um
 * componente sob medida. Quando definido, `fields` ainda é usado pra
 * inicialização e validação leve — o painel decide a UI inteira.
 */
export interface NodeMetaPatch {
  title?: string;
  description?: string;
}

export interface CustomPanelProps {
  values: Record<string, unknown>;
  /** Patch parcial — undefined remove a chave do draft. */
  onChange: (patch: Record<string, unknown>) => void;
  /** Permite ao painel reportar erros de validação por campo (trava o Salvar). */
  onError?: (name: string, msg: string | null) => void;
  /**
   * Meta editor-only (title/description do card). Só presente quando
   * `customPanelOwnsMeta` está ativo no schema — nesse caso o dialog
   * deixa de renderizar `MetaFields` inline pra o painel desenhar do seu jeito.
   */
  meta?: NodeMetaPatch;
  onMetaChange?: (next: NodeMetaPatch) => void;
}

export interface NodeConfigSchema {
  title: string;
  description?: string;
  fields: FieldDef[];
  /**
   * Quando definido, o dialog renderiza este componente no lugar do
   * `FieldsList` genérico. Use pra nós com UI rica (ex.: HTTP request).
   */
  customPanel?: React.ComponentType<CustomPanelProps>;
  /**
   * Tamanho do DialogContent. "default" = 4xl (com customPanel) / 2xl (sem);
   * "wide" = 6xl; "full" = 95vw x 95vh para painéis quase fullscreen.
   */
  dialogSize?: "default" | "wide" | "full";
  /**
   * Quando true, o dialog NÃO renderiza `MetaFields` no topo do body — o
   * próprio `customPanel` recebe `meta` + `onMetaChange` e decide onde
   * exibir título/descrição (ex.: dentro de um aside). O EditableTitle do
   * header continua funcionando.
   */
  customPanelOwnsMeta?: boolean;
}
