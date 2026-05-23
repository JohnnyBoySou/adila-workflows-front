import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  MoreHorizontal,
  PenLine,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";

import type { DashboardHandle } from "~/routes/dashboard";
import * as envVarsApi from "~/services/environment-variables";
import type { EnvironmentVariable } from "~/services/environment-variables";
import * as environmentsApi from "~/services/environments";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { queryKeys } from "~/lib/query-keys";

/* ─────────────── Parser .env / JSON ─────────────── */

type ParsedVar = { key: string; value: string; isSecret: boolean; error?: string };

function parseEnvText(raw: string): ParsedVar[] {
  const lines = raw.split(/\r?\n/);
  const result: ParsedVar[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) {
      result.push({ key: trimmed, value: "", isSecret: false, error: "sem sinal de =" });
      continue;
    }

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // Remove aspas externas: "value" ou 'value'
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    const invalid = !/^[A-Z_][A-Z0-9_]{0,127}$/.test(key);
    result.push({
      key,
      value,
      isSecret: false,
      error: invalid ? "chave inválida (use letras maiúsculas, dígitos, _)" : undefined,
    });
  }

  return result;
}

function parseJsonText(raw: string): ParsedVar[] {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj !== "object" || Array.isArray(obj) || obj === null) {
      return [{ key: "", value: "", isSecret: false, error: "JSON deve ser um objeto {}" }];
    }
    return Object.entries(obj).map(([k, v]) => {
      const invalid = !/^[A-Z_][A-Z0-9_]{0,127}$/.test(k);
      return {
        key: k,
        value: String(v ?? ""),
        isSecret: false,
        error: invalid ? "chave inválida" : undefined,
      };
    });
  } catch {
    return [{ key: "", value: "", isSecret: false, error: "JSON inválido" }];
  }
}

function detectAndParse(raw: string): { format: "env" | "json" | "unknown"; vars: ParsedVar[] } {
  const trimmed = raw.trim();
  if (!trimmed) return { format: "unknown", vars: [] };

  if (trimmed.startsWith("{")) {
    return { format: "json", vars: parseJsonText(trimmed) };
  }
  return { format: "env", vars: parseEnvText(trimmed) };
}

export const handle: DashboardHandle = {
  title: "Variáveis",
  parent: [{ label: "Ambientes", to: "/dashboard/environments" }],
};

const SECRET_MASK = "••••••••";

/* ─────────────── Diálogo nova variável ─────────────── */

function VariableCreateDialog({
  environmentId,
  open,
  onOpenChange,
}: {
  environmentId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();

  // ── aba manual ──
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [isSecret, setIsSecret] = useState(false);

  // ── aba colar ──
  const [pasteText, setPasteText] = useState("");
  const [parsedVars, setParsedVars] = useState<ParsedVar[]>([]);
  const [pasteFormat, setPasteFormat] = useState<"env" | "json" | "unknown">("unknown");

  function handlePasteChange(raw: string) {
    setPasteText(raw);
    const { format, vars } = detectAndParse(raw);
    setPasteFormat(format);
    setParsedVars(vars);
  }

  function toggleParsedSecret(idx: number) {
    setParsedVars((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, isSecret: !v.isSecret } : v)),
    );
  }

  function reset() {
    setKey(""); setValue(""); setIsSecret(false);
    setPasteText(""); setParsedVars([]); setPasteFormat("unknown");
  }

  const validParsed = parsedVars.filter((v) => v.key && !v.error);

  const manualMutation = useMutation({
    mutationFn: () => envVarsApi.create(environmentId, { key: key.trim(), value, isSecret }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.environments.variables(environmentId) });
      onOpenChange(false);
      reset();
    },
  });

  const bulkMutation = useMutation({
    mutationFn: () =>
      Promise.all(
        validParsed.map((v) =>
          envVarsApi.create(environmentId, { key: v.key, value: v.value, isSecret: v.isSecret }),
        ),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.environments.variables(environmentId) });
      onOpenChange(false);
      reset();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova variável</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="manual" className="mt-1">
          <TabsList className="w-full">
            <TabsTrigger value="manual" className="flex-1 gap-1.5">
              <PenLine className="size-3.5" />
              Manual
            </TabsTrigger>
            <TabsTrigger value="paste" className="flex-1 gap-1.5">
              <ClipboardPaste className="size-3.5" />
              Colar .env / JSON
            </TabsTrigger>
          </TabsList>

          {/* ── Aba manual ── */}
          <TabsContent value="manual">
            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="var-key">Chave</Label>
                <Input
                  id="var-key"
                  placeholder="DATABASE_URL"
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  autoFocus
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Letras maiúsculas, dígitos e underscore.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="var-value">Valor</Label>
                <Input
                  id="var-value"
                  type={isSecret ? "password" : "text"}
                  placeholder="valor da variável"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Lock className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Secret</p>
                    <p className="text-xs text-muted-foreground">Valor mascarado na listagem</p>
                  </div>
                </div>
                <Switch checked={isSecret} onCheckedChange={setIsSecret} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                onClick={() => manualMutation.mutate()}
                disabled={!key.trim() || !value || manualMutation.isPending}
              >
                {manualMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* ── Aba colar ── */}
          <TabsContent value="paste">
            <div className="space-y-3 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="paste-input">Cole o conteúdo</Label>
                <textarea
                  id="paste-input"
                  className="w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[120px] resize-y"
                  placeholder={"DATABASE_URL=postgres://...\nAPI_KEY=secret123\nDEBUG=false\n\nou JSON:\n{\"DATABASE_URL\": \"postgres://...\"}"}
                  value={pasteText}
                  onChange={(e) => handlePasteChange(e.target.value)}
                  autoFocus
                  spellCheck={false}
                />
                {pasteFormat !== "unknown" && pasteText.trim() && (
                  <p className="text-xs text-muted-foreground">
                    Formato detectado:{" "}
                    <span className="font-medium">{pasteFormat === "env" ? ".env" : "JSON"}</span>
                  </p>
                )}
              </div>

              {/* Preview */}
              {parsedVars.length > 0 && (
                <div className="rounded-md border">
                  <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground flex items-center justify-between">
                    <span>Preview — {validParsed.length} variável(is) válida(s)</span>
                    <span className="text-xs">Marcar como secret →</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y">
                    {parsedVars.map((v, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-2 text-xs"
                      >
                        {v.error ? (
                          <AlertCircle className="size-3.5 shrink-0 text-destructive" />
                        ) : (
                          <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
                        )}
                        <span className="font-mono font-medium min-w-0 truncate flex-1">
                          {v.key || <span className="text-muted-foreground italic">sem chave</span>}
                        </span>
                        {v.error ? (
                          <span className="text-destructive shrink-0">{v.error}</span>
                        ) : (
                          <>
                            <span className="text-muted-foreground font-mono truncate max-w-[120px]">
                              {v.value || <span className="italic">(vazio)</span>}
                            </span>
                            <Switch
                              checked={v.isSecret}
                              onCheckedChange={() => toggleParsedSecret(i)}
                              className="shrink-0 scale-75"
                            />
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                onClick={() => bulkMutation.mutate()}
                disabled={validParsed.length === 0 || bulkMutation.isPending}
              >
                {bulkMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {validParsed.length > 0
                  ? `Importar ${validParsed.length} variável(is)`
                  : "Importar"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── Diálogo editar variável ─────────────── */

function VariableEditDialog({
  environmentId,
  variable,
  open,
  onOpenChange,
}: {
  environmentId: string;
  variable: EnvironmentVariable | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(variable?.value ?? "");
  const [isSecret, setIsSecret] = useState(variable?.isSecret ?? false);

  const mutation = useMutation({
    mutationFn: () => envVarsApi.update(environmentId, variable!.id, { value, isSecret }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.environments.variables(environmentId) });
      onOpenChange(false);
    },
  });

  if (!variable) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Editar{" "}
            <span className="font-mono text-base">{variable.key}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-var-value">Valor</Label>
            <Input
              id="edit-var-value"
              type={isSecret ? "password" : "text"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="font-mono"
              autoFocus
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium">Secret</p>
            </div>
            <Switch checked={isSecret} onCheckedChange={setIsSecret} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── Diálogo deletar variável ─────────────── */

function VariableDeleteDialog({
  environmentId,
  variable,
  open,
  onOpenChange,
}: {
  environmentId: string;
  variable: EnvironmentVariable | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => envVarsApi.remove(environmentId, variable!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.environments.variables(environmentId) });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Deletar variável</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja deletar{" "}
          <span className="font-medium font-mono text-foreground">{variable?.key}</span>?
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Deletar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── Linha da variável ─────────────── */

function VariableRow({
  environmentId,
  variable,
  onEdit,
  onDelete,
}: {
  environmentId: string;
  variable: EnvironmentVariable;
  onEdit: (v: EnvironmentVariable) => void;
  onDelete: (v: EnvironmentVariable) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [realValue, setRealValue] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  async function handleReveal() {
    if (revealed) {
      setRevealed(false);
      return;
    }
    if (realValue !== null) {
      setRevealed(true);
      return;
    }
    setFetching(true);
    try {
      const full = await envVarsApi.get(environmentId, variable.id, true);
      setRealValue(full.value);
      setRevealed(true);
    } finally {
      setFetching(false);
    }
  }

  const displayValue = variable.isSecret
    ? revealed
      ? (realValue ?? variable.value)
      : SECRET_MASK
    : variable.value || "(vazio)";

  return (
    <tr className="group border-b last:border-0 hover:bg-muted/40">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{variable.key}</span>
          {variable.isSecret && (
            <Lock className="size-3 text-muted-foreground" />
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground break-all">{displayValue}</span>
          {variable.isSecret && (
            <button
              type="button"
              onClick={handleReveal}
              disabled={fetching}
              className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
              title={revealed ? "Ocultar" : "Revelar valor"}
            >
              {fetching
                ? <Loader2 className="size-3.5 animate-spin" />
                : revealed
                  ? <EyeOff className="size-3.5" />
                  : <Eye className="size-3.5" />}
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        {variable.isSecret ? (
          <Badge variant="outline" className="gap-1 text-xs">
            <Lock className="size-3" />
            Secret
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">
            Público
          </Badge>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(variable)}>Editar</DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => onDelete(variable)}
            >
              <Trash2 className="mr-2 size-4" />
              Deletar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

/* ─────────────── Rota principal ─────────────── */

export default function EnvironmentDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EnvironmentVariable | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnvironmentVariable | null>(null);

  const { data: environment, isLoading: envLoading } = useQuery({
    queryKey: queryKeys.environments.detail(id!),
    queryFn: () => environmentsApi.get(id!),
    enabled: Boolean(id),
  });

  const { data: variables, isLoading: varsLoading } = useQuery({
    queryKey: queryKeys.environments.variables(id!),
    queryFn: () => envVarsApi.list(id!),
    enabled: Boolean(id),
  });

  if (envLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!environment) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="font-medium">Ambiente não encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{environment.name}</h1>
            {environment.isDefault && (
              <Badge variant="secondary" className="text-xs">Padrão</Badge>
            )}
          </div>
          <p className="font-mono text-sm text-muted-foreground">{environment.slug}</p>
          {environment.description && (
            <p className="mt-1 text-sm text-muted-foreground">{environment.description}</p>
          )}
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          Nova variável
        </Button>
      </div>

      {/* Tabela de variáveis */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <KeyRound className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Variáveis de ambiente</h2>
          {variables && (
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {variables.length}
            </span>
          )}
        </div>

        {varsLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!varsLoading && variables?.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <KeyRound className="size-8 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium">Nenhuma variável</p>
              <p className="text-xs text-muted-foreground">
                Adicione variáveis para configurar seus workflows neste ambiente.
              </p>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" />
              Nova variável
            </Button>
          </div>
        )}

        {!varsLoading && variables && variables.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Chave</th>
                <th className="px-4 py-2 font-medium">Valor</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {variables.map((v) => (
                <VariableRow
                  key={v.id}
                  environmentId={id!}
                  variable={v}
                  onEdit={setEditTarget}
                  onDelete={setDeleteTarget}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <VariableCreateDialog
        environmentId={id!}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <VariableEditDialog
        environmentId={id!}
        variable={editTarget}
        open={editTarget !== null}
        onOpenChange={(v) => { if (!v) setEditTarget(null); }}
      />
      <VariableDeleteDialog
        environmentId={id!}
        variable={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
      />
    </div>
  );
}
