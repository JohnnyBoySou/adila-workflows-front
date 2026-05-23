/**
 * Service de database connections (Postgres + Redis) — registro por workflow.
 *
 * Espelha as rotas em `/workflows/:id/database-connections`. A URL crua
 * nunca volta na resposta (o backend retorna metadados); só existe ao
 * criar/editar via `connectionString` no body.
 */
import { $fetch, unwrap } from "./index";

export type DatabaseConnectionKind = "postgres" | "redis";

export type DatabaseConnection = {
  id: string;
  workflowId: string;
  environmentId: string | null;
  name: string;
  kind: DatabaseConnectionKind;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateConnectionInput = {
  name: string;
  kind: DatabaseConnectionKind;
  environmentId?: string | null;
  connectionString: string;
};

export type UpdateConnectionInput = {
  name?: string;
  environmentId?: string | null;
  connectionString?: string;
};

export type TestResult = {
  ok: boolean;
  latencyMs: number;
  message: string;
};

export type SchemaColumn = {
  name: string;
  dataType: string;
  jsType: "string" | "number" | "boolean" | "date" | "json" | "unknown";
  nullable: boolean;
  isPrimaryKey: boolean;
  default: string | null;
};

export type SchemaTable = {
  schema: string;
  name: string;
  columns: SchemaColumn[];
};

export type DatabaseSchema = {
  tables: SchemaTable[];
  fetchedAt: number;
};

export function list(
  workflowId: string,
  filters?: { kind?: DatabaseConnectionKind; environmentId?: string | null },
): Promise<DatabaseConnection[]> {
  const query: Record<string, string> = {};
  if (filters?.kind) query.kind = filters.kind;
  if (filters?.environmentId === null) query.environmentId = "null";
  else if (filters?.environmentId) query.environmentId = filters.environmentId;
  return unwrap(
    $fetch<DatabaseConnection[]>(`/workflows/${workflowId}/database-connections`, {
      query: Object.keys(query).length ? query : undefined,
    }),
  );
}

export function create(
  workflowId: string,
  body: CreateConnectionInput,
): Promise<DatabaseConnection> {
  return unwrap(
    $fetch<DatabaseConnection>(`/workflows/${workflowId}/database-connections`, {
      method: "POST",
      body,
    }),
  );
}

export function update(
  workflowId: string,
  connectionId: string,
  body: UpdateConnectionInput,
): Promise<DatabaseConnection> {
  return unwrap(
    $fetch<DatabaseConnection>(`/workflows/${workflowId}/database-connections/${connectionId}`, {
      method: "PATCH",
      body,
    }),
  );
}

export function remove(workflowId: string, connectionId: string): Promise<void> {
  return unwrap(
    $fetch<void>(`/workflows/${workflowId}/database-connections/${connectionId}`, {
      method: "DELETE",
    }),
  );
}

export function test(workflowId: string, connectionId: string): Promise<TestResult> {
  return unwrap(
    $fetch<TestResult>(`/workflows/${workflowId}/database-connections/${connectionId}/test`, {
      method: "POST",
    }),
  );
}

export function schema(
  workflowId: string,
  connectionId: string,
  opts?: { refresh?: boolean },
): Promise<DatabaseSchema> {
  return unwrap(
    $fetch<DatabaseSchema>(`/workflows/${workflowId}/database-connections/${connectionId}/schema`, {
      query: opts?.refresh ? { refresh: "true" } : undefined,
    }),
  );
}
