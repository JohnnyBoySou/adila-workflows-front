import { $fetch, unwrap } from "./index";

export type Comment = {
  id: string;
  organizationId: string;
  workflowId: string;
  parentId: string | null;
  authorId: string;
  body: string;
  mentions: string[];
  x: number | null;
  y: number | null;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateCommentInput = {
  body: string;
  mentions?: string[];
  x?: number;
  y?: number;
  parentId?: string;
};

export type UpdateCommentInput = {
  body?: string;
  mentions?: string[];
  resolved?: boolean;
};

export function list(workflowId: string): Promise<Comment[]> {
  return unwrap($fetch<Comment[]>(`/workflows/${workflowId}/comments`));
}

export function create(workflowId: string, input: CreateCommentInput): Promise<Comment> {
  return unwrap(
    $fetch<Comment>(`/workflows/${workflowId}/comments`, {
      method: "POST",
      body: input,
    }),
  );
}

export function update(
  workflowId: string,
  commentId: string,
  input: UpdateCommentInput,
): Promise<Comment> {
  return unwrap(
    $fetch<Comment>(`/workflows/${workflowId}/comments/${commentId}`, {
      method: "PATCH",
      body: input,
    }),
  );
}

export function remove(workflowId: string, commentId: string): Promise<{ ok: true }> {
  return unwrap(
    $fetch<{ ok: true }>(`/workflows/${workflowId}/comments/${commentId}`, {
      method: "DELETE",
    }),
  );
}
