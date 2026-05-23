import { $fetch, unwrap } from "./index";

export type EnvironmentVariable = {
  id: string;
  organizationId: string;
  environmentId: string;
  key: string;
  /** Mascarado como "********" quando isSecret=true e reveal=false. */
  value: string;
  isSecret: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateVariableInput = {
  key: string;
  value: string;
  isSecret?: boolean;
};

export type UpdateVariableInput = {
  value?: string;
  isSecret?: boolean;
};

export function list(environmentId: string, reveal = false): Promise<EnvironmentVariable[]> {
  return unwrap(
    $fetch<EnvironmentVariable[]>(`/environments/${environmentId}/variables`, {
      query: reveal ? { reveal: "true" } : undefined,
    }),
  );
}

export function get(
  environmentId: string,
  variableId: string,
  reveal = false,
): Promise<EnvironmentVariable> {
  return unwrap(
    $fetch<EnvironmentVariable>(`/environments/${environmentId}/variables/${variableId}`, {
      query: reveal ? { reveal: "true" } : undefined,
    }),
  );
}

export function create(
  environmentId: string,
  body: CreateVariableInput,
): Promise<EnvironmentVariable> {
  return unwrap(
    $fetch<EnvironmentVariable>(`/environments/${environmentId}/variables`, {
      method: "POST",
      body,
    }),
  );
}

export function update(
  environmentId: string,
  variableId: string,
  body: UpdateVariableInput,
): Promise<EnvironmentVariable> {
  return unwrap(
    $fetch<EnvironmentVariable>(`/environments/${environmentId}/variables/${variableId}`, {
      method: "PATCH",
      body,
    }),
  );
}

export function remove(environmentId: string, variableId: string): Promise<void> {
  return unwrap(
    $fetch<void>(`/environments/${environmentId}/variables/${variableId}`, { method: "DELETE" }),
  );
}
