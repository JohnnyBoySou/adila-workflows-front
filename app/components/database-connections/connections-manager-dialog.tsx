/**
 * Gerenciador de database connections do workflow.
 *
 * Aberto a partir da barra superior do editor (ícone DB). Lista, cria,
 * edita, deleta e testa connections. URL sensível só transita ao criar
 * ou ao explicitamente atualizar — nunca volta nas respostas (o backend
 * filtra antes de mandar).
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Database, Loader2, Plus, RefreshCw, Trash2, XCircle } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import * as dbConnections from "~/services/database-connections";

interface ConnectionsManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  /**
   * Lista de ambientes pra escolher no campo `environment` ao criar/editar.
   * Quando vazio, o usuário só pode criar connections "default" (env=null).
   */
  environments?: Array<{ id: string; name: string }>;
  /** Callback opcional ao mutar — usado pelo picker pra invalidar cache local. */
  onMutate?: () => void;
}

type FormState = {
  id?: string;
  name: string;
  kind: dbConnections.DatabaseConnectionKind;
  environmentId: string | null;
  connectionString: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  kind: "postgres",
  environmentId: null,
  connectionString: "",
};

type TestStatus = { state: "idle" } | { state: "running" } | { state: "done"; result: dbConnections.TestResult };

export function ConnectionsManagerDialog({
  open,
  onOpenChange,
  workflowId,
  environments = [],
  onMutate,
}: ConnectionsManagerDialogProps) {
  const [items, setItems] = useState<dbConnections.DatabaseConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [tests, setTests] = useState<Record<string, TestStatus>>({});

  const editing = Boolean(form.id);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await dbConnections.list(workflowId);
      setItems(rows);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workflowId]);

  function startEdit(c: dbConnections.DatabaseConnection) {
    // connectionString nunca volta do backend — fica vazio até o usuário digitar uma nova.
    setForm({
      id: c.id,
      name: c.name,
      kind: c.kind,
      environmentId: c.environmentId,
      connectionString: "",
    });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    setError(null);
    if (!form.name.trim()) {
      setError("Nome é obrigatório.");
      return;
    }
    if (!editing && !form.connectionString.trim()) {
      setError("Connection string é obrigatória ao criar.");
      return;
    }
    setSaving(true);
    try {
      if (editing && form.id) {
        await dbConnections.update(workflowId, form.id, {
          name: form.name,
          environmentId: form.environmentId,
          // Só envia connectionString se o usuário digitou algo (rotação).
          ...(form.connectionString.trim() && {
            connectionString: form.connectionString.trim(),
          }),
        });
      } else {
        await dbConnections.create(workflowId, {
          name: form.name,
          kind: form.kind,
          environmentId: form.environmentId,
          connectionString: form.connectionString.trim(),
        });
      }
      resetForm();
      await reload();
      onMutate?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Deletar essa credencial? Nodes que a referenciam vão falhar.")) return;
    try {
      await dbConnections.remove(workflowId, id);
      if (form.id === id) resetForm();
      await reload();
      onMutate?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleTest(id: string) {
    setTests((t) => ({ ...t, [id]: { state: "running" } }));
    try {
      const result = await dbConnections.test(workflowId, id);
      setTests((t) => ({ ...t, [id]: { state: "done", result } }));
    } catch (err) {
      setTests((t) => ({
        ...t,
        [id]: {
          state: "done",
          result: { ok: false, latencyMs: 0, message: (err as Error).message },
        },
      }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="size-5" />
            Credenciais tipadas
          </DialogTitle>
          <DialogDescription>
            Cadastre Postgres/Redis usados pelos nodes deste workflow — credenciais tipadas
            oferecem teste de conexão e introspecção de schema. URLs ficam cifradas em
            repouso (AES-256-GCM). Para secrets simples (API keys, webhooks), use Variáveis
            de ambiente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_320px] gap-4 overflow-hidden">
          {/* Lista ────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2 overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Cadastradas ({items.length})</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void reload()}
                disabled={loading}
                aria-label="Recarregar"
                title="Recarregar"
              >
                <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto rounded-md border">
              {items.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  {loading ? "Carregando…" : "Nenhuma credencial ainda."}
                </div>
              ) : (
                <ul className="divide-y">
                  {items.map((c) => {
                    const test = tests[c.id];
                    const envName = c.environmentId
                      ? environments.find((e) => e.id === c.environmentId)?.name ?? "(env)"
                      : "default";
                    return (
                      <li
                        key={c.id}
                        className={cn(
                          "flex items-start gap-2 p-2.5",
                          form.id === c.id && "bg-muted/50",
                        )}
                      >
                        <button
                          type="button"
                          className="flex flex-1 flex-col items-start gap-0.5 text-left"
                          onClick={() => startEdit(c)}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium">{c.name}</span>
                            <Badge variant="outline" className="h-4 px-1 text-[10px]">
                              {c.kind}
                            </Badge>
                            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                              {envName}
                            </Badge>
                          </div>
                          {test?.state === "done" && (
                            <span
                              className={cn(
                                "flex items-center gap-1 text-[11px]",
                                test.result.ok ? "text-emerald-600" : "text-destructive",
                              )}
                            >
                              {test.result.ok ? (
                                <CheckCircle2 className="size-3" />
                              ) : (
                                <XCircle className="size-3" />
                              )}
                              {test.result.ok
                                ? `OK · ${test.result.latencyMs}ms`
                                : test.result.message}
                            </span>
                          )}
                        </button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => void handleTest(c.id)}
                          disabled={test?.state === "running"}
                        >
                          {test?.state === "running" ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            "Testar"
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-7 text-destructive"
                          onClick={() => void handleDelete(c.id)}
                          aria-label="Deletar"
                          title="Deletar"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Form ────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 overflow-y-auto rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                {editing ? "Editar" : "Nova credencial"}
              </h3>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs"
                  onClick={resetForm}
                >
                  <Plus className="size-3" /> Nova
                </Button>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="main_db"
                maxLength={64}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select
                value={form.kind}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, kind: v as dbConnections.DatabaseConnectionKind }))
                }
                disabled={editing}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postgres">Postgres</SelectItem>
                  <SelectItem value="redis">Redis</SelectItem>
                </SelectContent>
              </Select>
              {editing && (
                <p className="text-[11px] text-muted-foreground">
                  Tipo é imutável depois de criado.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ambiente</Label>
              <Select
                value={form.environmentId ?? "__default__"}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    environmentId: v === "__default__" ? null : v,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Default (todos os envs)</SelectItem>
                  {environments.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Connection string
                {editing && (
                  <span className="ml-1 text-muted-foreground">(deixe vazio pra manter)</span>
                )}
              </Label>
              <Input
                type="password"
                autoComplete="off"
                value={form.connectionString}
                onChange={(e) => setForm((f) => ({ ...f, connectionString: e.target.value }))}
                placeholder={
                  form.kind === "postgres"
                    ? "postgres://user:pass@host:5432/db"
                    : "redis://:pass@host:6379/0"
                }
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="w-full"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : editing ? (
                "Salvar"
              ) : (
                "Criar"
              )}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
