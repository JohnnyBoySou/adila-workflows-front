/**
 * Service de pastas.
 *
 * Espelha a feature `folders` do backend. Pastas formam uma árvore
 * via `parentId` (raiz quando `null`).
 */
import { $fetch, unwrap } from "./index";

export type Folder = {
  id: string;
  organizationId: string;
  name: string;
  parentId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ListFoldersParams = {
  /** `"root"` → só pastas raiz; UUID → filhos diretos da pasta informada. */
  parentId?: string | "root";
};

export function list(params: ListFoldersParams = {}): Promise<Folder[]> {
  return unwrap(
    $fetch<Folder[]>("/folders", {
      query: {
        ...(params.parentId && { parentId: params.parentId }),
      },
    }),
  );
}

export function get(id: string): Promise<Folder> {
  return unwrap($fetch<Folder>(`/folders/${id}`));
}

export function create(input: { name: string; parentId?: string | null }): Promise<Folder> {
  return unwrap($fetch<Folder>("/folders", { method: "POST", body: input }));
}

export function update(
  id: string,
  input: { name?: string; parentId?: string | null },
): Promise<Folder> {
  return unwrap($fetch<Folder>(`/folders/${id}`, { method: "PATCH", body: input }));
}

export function remove(id: string): Promise<void> {
  return unwrap($fetch<void>(`/folders/${id}`, { method: "DELETE" }));
}
