/**
 * Hook de comentários do workflow.
 *
 * Combina React Query (list inicial + mutations) com eventos WS vindos do
 * gateway de colaboração — quando outro cliente posta/edita/deleta, o cache
 * local é atualizado sem refetch.
 *
 * Também dispara toast quando o usuário corrente é mencionado em um
 * comentário recém-criado por outro participante da sala.
 */
import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "~/lib/query-keys";
import { notify } from "~/lib/notify";
import * as commentsApi from "~/services/comments";
import type { Comment, CreateCommentInput, UpdateCommentInput } from "~/services/comments";

type CommentEvent =
  | { type: "comment.created"; workflowId: string; comment: Comment }
  | { type: "comment.updated"; workflowId: string; comment: Comment }
  | { type: "comment.deleted"; workflowId: string; commentId: string };

export type CommentThread = {
  root: Comment;
  replies: Comment[];
};

type MemberLookup = Map<string, { id: string; name?: string | null; email?: string | null }>;

type UseWorkflowCommentsOptions = {
  workflowId: string;
  currentUserId: string | undefined;
  /** Lookup pra resolver nomes em toasts de menção. */
  membersIndex?: MemberLookup;
};

export function useWorkflowComments({
  workflowId,
  currentUserId,
  membersIndex,
}: UseWorkflowCommentsOptions) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.comments.byWorkflow(workflowId);

  const query = useQuery({
    queryKey,
    queryFn: () => commentsApi.list(workflowId),
    enabled: Boolean(workflowId),
    staleTime: 30_000,
  });

  const list = query.data ?? [];

  // Agrupa em threads (raiz + replies). Raiz tem parentId=null.
  const threads = useMemo<CommentThread[]>(() => {
    const roots = list.filter((c) => c.parentId === null);
    const byParent = new Map<string, Comment[]>();
    for (const c of list) {
      if (c.parentId) {
        const arr = byParent.get(c.parentId) ?? [];
        arr.push(c);
        byParent.set(c.parentId, arr);
      }
    }
    return roots.map((root) => ({
      root,
      replies: (byParent.get(root.id) ?? []).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      ),
    }));
  }, [list]);

  // ── Mutations ─────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (input: CreateCommentInput) => commentsApi.create(workflowId, input),
    onSuccess: (created) => {
      // Otimismo: insere direto no cache. O broadcast também vai disparar,
      // mas como já temos o item, o handler é idempotente (Map by id).
      queryClient.setQueryData<Comment[]>(queryKey, (old) => {
        if (!old) return [created];
        if (old.some((c) => c.id === created.id)) return old;
        return [...old, created];
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ commentId, patch }: { commentId: string; patch: UpdateCommentInput }) =>
      commentsApi.update(workflowId, commentId, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData<Comment[]>(queryKey, (old) =>
        old?.map((c) => (c.id === updated.id ? updated : c)) ?? [updated],
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => commentsApi.remove(workflowId, commentId),
    onSuccess: (_res, commentId) => {
      queryClient.setQueryData<Comment[]>(queryKey, (old) =>
        old?.filter((c) => c.id !== commentId),
      );
    },
  });

  // ── Handler de WS ─────────────────────────────────────────────────────
  const handleEvent = useCallback(
    (event: CommentEvent) => {
      if (event.workflowId !== workflowId) return;
      if (event.type === "comment.deleted") {
        queryClient.setQueryData<Comment[]>(queryKey, (old) =>
          old?.filter((c) => c.id !== event.commentId),
        );
        return;
      }
      const incoming = event.comment;
      queryClient.setQueryData<Comment[]>(queryKey, (old) => {
        if (!old) return [incoming];
        const idx = old.findIndex((c) => c.id === incoming.id);
        if (idx === -1) return [...old, incoming];
        const next = old.slice();
        next[idx] = incoming;
        return next;
      });

      // Menção: se o user corrente foi mencionado e não é o autor, mostra toast.
      if (
        event.type === "comment.created" &&
        currentUserId &&
        incoming.authorId !== currentUserId &&
        incoming.mentions.includes(currentUserId)
      ) {
        const m = membersIndex?.get(incoming.authorId);
        const authorName = m?.name || m?.email || "Alguém";
        notify({
          title: `${authorName} mencionou você`,
          description:
            incoming.body.length > 120 ? incoming.body.slice(0, 117) + "…" : incoming.body,
        });
      }
    },
    [workflowId, queryClient, queryKey, currentUserId, membersIndex],
  );

  // Refetch quando volta do offline — invalida e busca de novo.
  useEffect(() => {
    function onFocus() {
      if (query.isStale) queryClient.invalidateQueries({ queryKey });
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [queryClient, queryKey, query.isStale]);

  return {
    comments: list,
    threads,
    isLoading: query.isLoading,
    handleEvent,
    createComment: createMutation.mutateAsync,
    updateComment: updateMutation.mutateAsync,
    deleteComment: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
