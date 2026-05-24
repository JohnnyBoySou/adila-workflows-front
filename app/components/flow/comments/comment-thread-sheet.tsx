import { useEffect, useMemo, useState } from "react";
import { Check, MoreHorizontal, Trash2 } from "lucide-react";

import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import type { CommentThread } from "~/hooks/use-workflow-comments";
import type { Comment, CreateCommentInput, UpdateCommentInput } from "~/services/comments";
import { MentionInput, type MentionMember } from "./mention-input";

type CommentThreadSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Thread aberta (null = criando um novo). */
  thread: CommentThread | null;
  /** Coords do pin sendo criado (apenas quando thread === null). */
  draftCoords?: { x: number; y: number } | null;
  members: MentionMember[];
  currentUserId: string | undefined;
  onCreateRoot: (input: CreateCommentInput) => Promise<unknown>;
  onCreateReply: (parentId: string, input: CreateCommentInput) => Promise<unknown>;
  onUpdate: (commentId: string, patch: UpdateCommentInput) => Promise<unknown>;
  onDelete: (commentId: string) => Promise<unknown>;
};

function memberName(members: MentionMember[], id: string): string {
  const m = members.find((x) => x.id === id);
  return m?.name || m?.email || id.slice(0, 6);
}

function memberInitial(members: MentionMember[], id: string): string {
  const label = memberName(members, id);
  return label.charAt(0).toUpperCase();
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function CommentThreadSheet({
  open,
  onOpenChange,
  thread,
  draftCoords,
  members,
  currentUserId,
  onCreateRoot,
  onCreateReply,
  onUpdate,
  onDelete,
}: CommentThreadSheetProps) {
  const [draftBody, setDraftBody] = useState("");
  const [draftMentions, setDraftMentions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Reset ao trocar de thread.
  useEffect(() => {
    setDraftBody("");
    setDraftMentions([]);
  }, [thread?.root.id, open]);

  const headerTitle = thread ? "Thread de comentário" : "Novo comentário";
  const headerDesc = thread
    ? thread.root.resolved
      ? "Resolvida"
      : `${thread.replies.length} ${thread.replies.length === 1 ? "resposta" : "respostas"}`
    : "Adicione o primeiro comentário neste ponto";

  async function handleSubmit() {
    const body = draftBody.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      if (!thread) {
        if (!draftCoords) return;
        await onCreateRoot({
          body,
          mentions: draftMentions,
          x: draftCoords.x,
          y: draftCoords.y,
        });
        onOpenChange(false);
      } else {
        await onCreateReply(thread.root.id, { body, mentions: draftMentions });
        setDraftBody("");
        setDraftMentions([]);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const flatComments = useMemo<Comment[]>(() => {
    if (!thread) return [];
    return [thread.root, ...thread.replies];
  }, [thread]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[420px] flex-col gap-0 sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>{headerTitle}</SheetTitle>
          <SheetDescription>{headerDesc}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-4 py-3">
          {thread ? (
            <div className="space-y-4">
              {flatComments.map((c) => (
                <article key={c.id} className="flex gap-3">
                  <Avatar className="size-8">
                    <AvatarFallback>{memberInitial(members, c.authorId)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <header className="flex items-center justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">
                          {memberName(members, c.authorId)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(c.createdAt)}
                        </span>
                      </div>
                      {(c.authorId === currentUserId || c.parentId === null) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-6">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {c.parentId === null ? (
                              <DropdownMenuItem
                                onClick={() => onUpdate(c.id, { resolved: !c.resolved })}
                              >
                                <Check className="mr-2 size-4" />
                                {c.resolved ? "Reabrir" : "Resolver"}
                              </DropdownMenuItem>
                            ) : null}
                            {c.authorId === currentUserId ? (
                              <DropdownMenuItem
                                onClick={() => onDelete(c.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 size-4" />
                                Excluir
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </header>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{c.body}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Escreva abaixo. Use <code className="rounded bg-muted px-1">@</code> para mencionar
              alguém da equipe.
            </p>
          )}
        </div>

        <footer className="border-t p-4">
          <MentionInput
            value={draftBody}
            onChange={(v, ms) => {
              setDraftBody(v);
              setDraftMentions(ms);
            }}
            members={members}
            placeholder={thread ? "Responder..." : "Comentar..."}
            autoFocus
            onSubmit={handleSubmit}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">⌘+Enter para enviar</span>
            <Button onClick={handleSubmit} disabled={!draftBody.trim() || submitting} size="sm">
              {thread ? "Responder" : "Publicar"}
            </Button>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
