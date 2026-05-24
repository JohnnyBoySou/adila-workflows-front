/**
 * Painel dedicado pro nó `redis` — espelha a UX do `postgres-panel` numa
 * versão enxuta. Persiste a connection como `connectionRef` (nome lógico),
 * mesmo modo do Postgres, pra que promover uma versão entre ambientes
 * resolva pra credenciais distintas sem reescrever a definition.
 *
 * Shape persistido em `values`:
 *   connectionRef: string      (nome — preferido)
 *   connectionId?: string      (UUID legado — aceito read-only)
 *   connectionString?: string  (legado pré-connections — escondido na UI;
 *                              preservado pra não sobrescrever)
 *   operation: string          (get/set/del/...)
 *   args: string[]             (argumentos posicionais por operação)
 */
import { useState } from "react";

import { ConnectionPicker } from "~/components/database-connections/connection-picker";
import { ConnectionsManagerDialog } from "~/components/database-connections/connections-manager-dialog";
import { useWorkflowId } from "../workflow-context";
import { FieldRenderer } from "./fields";
import type { CustomPanelProps, FieldDef } from "./types";

const OPERATION_FIELD: FieldDef = {
  name: "operation",
  label: "Operação",
  type: "select",
  required: true,
  options: [
    { value: "get", label: "GET" },
    { value: "set", label: "SET" },
    { value: "del", label: "DEL" },
    { value: "incr", label: "INCR" },
    { value: "decr", label: "DECR" },
    { value: "expire", label: "EXPIRE" },
    { value: "ttl", label: "TTL" },
    { value: "exists", label: "EXISTS" },
    { value: "hget", label: "HGET" },
    { value: "hset", label: "HSET" },
    { value: "hdel", label: "HDEL" },
    { value: "lpush", label: "LPUSH (lista, push à esquerda)" },
    { value: "rpush", label: "RPUSH (lista, push à direita)" },
    { value: "lpop", label: "LPOP" },
    { value: "rpop", label: "RPOP" },
    { value: "llen", label: "LLEN" },
    { value: "lrange", label: "LRANGE (chave, start, stop)" },
  ],
};

const ARGS_FIELD: FieldDef = {
  name: "args",
  label: "Argumentos",
  type: "stringList",
  description: "Lista posicional — ex: chave, valor, ttl. Suporta `{{ … }}`.",
};

export function RedisPanel({ values, onChange, onError }: CustomPanelProps) {
  // Espelha a leitura do PostgresPanel: prefere `connectionRef` (nome) com
  // fallback no UUID legado pra não esconder a config de workflows antigos.
  const connectionRef =
    typeof values.connectionRef === "string"
      ? values.connectionRef
      : typeof values.connectionId === "string"
        ? values.connectionId
        : undefined;

  const workflowId = useWorkflowId() ?? "";
  const [managerOpen, setManagerOpen] = useState(false);

  const handlePickConnection = (ref: string | undefined) => {
    // Limpa `connectionId` (UUID) e `connectionString` (legado pré-connections)
    // ao gravar uma ref nova — evita ambiguidade em runtime.
    onChange({
      connectionRef: ref,
      connectionId: undefined,
      connectionString: undefined,
    });
  };

  return (
    <div className="flex flex-col gap-5 px-3">
      <ConnectionPicker
        kind="redis"
        value={connectionRef}
        onChange={handlePickConnection}
        onManageClick={() => setManagerOpen(true)}
        label="Connection"
        required
        valueKind="name"
      />

      <FieldRenderer
        field={OPERATION_FIELD}
        value={values.operation}
        error={null}
        onChange={(next) => onChange({ operation: next })}
        onParseError={(msg) => onError?.("operation", msg)}
      />

      <FieldRenderer
        field={ARGS_FIELD}
        value={values.args}
        error={null}
        onChange={(next) => onChange({ args: next })}
        onParseError={(msg) => onError?.("args", msg)}
      />

      <ConnectionsManagerDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        workflowId={workflowId}
      />
    </div>
  );
}
