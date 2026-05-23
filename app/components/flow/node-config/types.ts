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

export interface NodeConfigSchema {
  title: string;
  description?: string;
  fields: FieldDef[];
}
