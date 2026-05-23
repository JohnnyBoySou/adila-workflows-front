import { $fetch, unwrap } from "./index";

export type EnvironmentKind = "development" | "test" | "stage" | "production";

export type Environment = {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  kind: EnvironmentKind;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateEnvironmentInput = {
  slug: string;
  name: string;
  kind?: EnvironmentKind;
  description?: string;
  isDefault?: boolean;
};

export type UpdateEnvironmentInput = {
  slug?: string;
  name?: string;
  kind?: EnvironmentKind;
  description?: string | null;
  isDefault?: boolean;
};

export function list(): Promise<Environment[]> {
  return unwrap($fetch<Environment[]>("/environments"));
}

export function get(id: string): Promise<Environment> {
  return unwrap($fetch<Environment>(`/environments/${id}`));
}

export function create(body: CreateEnvironmentInput): Promise<Environment> {
  return unwrap($fetch<Environment>("/environments", { method: "POST", body }));
}

export function update(id: string, body: UpdateEnvironmentInput): Promise<Environment> {
  return unwrap($fetch<Environment>(`/environments/${id}`, { method: "PATCH", body }));
}

export function remove(id: string): Promise<void> {
  return unwrap($fetch<void>(`/environments/${id}`, { method: "DELETE" }));
}
