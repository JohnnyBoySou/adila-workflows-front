/**
 * Dialog para importar um workflow exportado do n8n.
 *
 * O usuário escolhe um arquivo `.json` ou cola o JSON direto. Antes do POST
 * fazemos parse local pra falhar cedo com erro humano se o conteúdo estiver
 * corrompido — não enviamos lixo pro backend.
 *
 * Após sucesso, exibe o `summary` (mapped/unsupported/skipped) e oferece um
 * botão "Abrir no editor" — alguns nós tipicamente caem em `unsupported`
 * (viram noop com `originalType` em `config`), então é importante o usuário
 * ver o que precisa revisar antes de executar.
 */
import { useCallback, useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileJson, Loader2, Upload } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

import * as workflowsApi from "~/services/workflows";
import type { N8nImportSummary, Workflow } from "~/services/workflows";
import { queryKeys } from "~/lib/query-keys";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — n8n exporta JSON denso mas raramente passa disso.

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pasta destino — passa o `folder` corrente do dashboard. `null` = raiz. */
  folderId: string | null;
  /** Notifica o pai pra navegar/abrir o editor depois do summary. */
  onImported?: (workflow: Workflow) => void;
};

export function N8nImportDialog({ open, onOpenChange, folderId, onImported }: Props) {
  const nameInputId = useId();
  const queryClient = useQueryClient();

  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [result, setResult] = useState<{ workflow: Workflow; summary: N8nImportSummary } | null>(
    null,
  );

  const mutation = useMutation({
    mutationFn: (input: workflowsApi.ImportFromN8nInput) => workflowsApi.importFromN8n(input),
    onSuccess: (res) => {
      setResult(res);
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });

  // Reseta tudo ao fechar — o dialog é "one-shot".
  function resetState() {
    setText("");
    setName("");
    setParseError(null);
    setFileName(null);
    setResult(null);
    mutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetState();
      onOpenChange(next);
    },
    [onOpenChange],
  );

  function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      setParseError(`Arquivo grande demais (>${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB).`);
      return;
    }
    setFileName(file.name);
    setParseError(null);
    file
      .text()
      .then((content) => {
        setText(content);
        if (!name) {
          // Sugere o nome a partir do arquivo (sem extensão).
          setName(file.name.replace(/\.json$/i, ""));
        }
      })
      .catch((e: unknown) => {
        setParseError(e instanceof Error ? e.message : "Falha ao ler arquivo.");
      });
  }

  function handleSubmit() {
    setParseError(null);
    let parsed: Record<string, unknown>;
    try {
      const raw = JSON.parse(text);
      // n8n às vezes embrulha em { workflows: [...] } na export multi-workflow.
      // Pegamos o primeiro como conveniência — usuário pode editar o JSON
      // pra escolher outro.
      if (Array.isArray((raw as { workflows?: unknown[] }).workflows)) {
        const arr = (raw as { workflows: unknown[] }).workflows;
        if (arr.length === 0) throw new Error("Export n8n vazio (sem `workflows`).");
        parsed = arr[0] as Record<string, unknown>;
      } else {
        parsed = raw as Record<string, unknown>;
      }
    } catch (e) {
      setParseError(e instanceof Error ? `JSON inválido: ${e.message}` : "JSON inválido.");
      return;
    }
    mutation.mutate({
      workflow: parsed,
      ...(name.trim() && { name: name.trim() }),
      folderId,
    });
  }

  const canSubmit = text.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileJson className="size-4" />
            Importar do n8n
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cole o JSON exportado do n8n ou selecione um arquivo `.json`.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 py-4">
          {result ? (
            <ImportResultView result={result} />
          ) : (
            <ImportForm
              text={text}
              onTextChange={setText}
              name={name}
              onNameChange={setName}
              nameInputId={nameInputId}
              fileName={fileName}
              onFile={handleFile}
              fileInputRef={fileInputRef}
              parseError={parseError ?? (mutation.error instanceof Error ? mutation.error.message : null)}
            />
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          {result ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
              <Button
                onClick={() => {
                  onImported?.(result.workflow);
                  handleOpenChange(false);
                }}
              >
                Abrir no editor
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {mutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Importando…
                  </>
                ) : (
                  "Importar"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Form: arquivo + textarea + nome ───────────────────────────────────────
function ImportForm({
  text,
  onTextChange,
  name,
  onNameChange,
  nameInputId,
  fileName,
  onFile,
  fileInputRef,
  parseError,
}: {
  text: string;
  onTextChange: (v: string) => void;
  name: string;
  onNameChange: (v: string) => void;
  nameInputId: string;
  fileName: string | null;
  onFile: (file: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  parseError: string | null;
}) {
  return (
    <div className="flex flex-col gap-4 px-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium">Arquivo</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" />
            Selecionar `.json`
          </Button>
          {fileName && (
            <span className="text-xs text-muted-foreground" title={fileName}>
              {fileName}
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameInputId} className="text-xs font-medium">
          Nome (opcional)
        </Label>
        <Input
          id={nameInputId}
          value={name}
          placeholder="Padrão: nome contido no JSON do n8n"
          onChange={(e) => onNameChange(e.target.value)}
          className="h-9"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium">JSON</Label>
        <Textarea
          value={text}
          rows={12}
          placeholder='{ "name": "My workflow", "nodes": [...], "connections": {...} }'
          spellCheck={false}
          onChange={(e) => onTextChange(e.target.value)}
          className={cn(
            "font-mono text-xs",
            parseError && "border-destructive focus-visible:ring-destructive/30",
          )}
        />
        {parseError && <p className="text-[11px] text-destructive">{parseError}</p>}
      </div>
    </div>
  );
}

// ── Resultado: summary detalhado ──────────────────────────────────────────
function ImportResultView({
  result,
}: {
  result: { workflow: Workflow; summary: N8nImportSummary };
}) {
  const { summary, workflow } = result;
  const hasUnsupported = summary.unsupported > 0;
  return (
    <div className="flex flex-col gap-4 px-3">
      <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
        <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />
        <div className="text-sm">
          <p className="font-medium">Workflow importado</p>
          <p className="text-xs text-muted-foreground">
            <strong>{workflow.name}</strong> — {summary.mapped} de {summary.total} nós mapeados.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Mapeados" value={summary.mapped} tone="ok" />
        <Stat label="Não suportados" value={summary.unsupported} tone={hasUnsupported ? "warn" : "muted"} />
        <Stat label="Ignorados" value={summary.skipped} tone="muted" />
      </div>

      {hasUnsupported && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4 text-amber-600" />
            Tipos sem handler nativo
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            Esses nós foram salvos como <code className="rounded bg-muted px-1">noop</code> com o
            tipo original em <code className="rounded bg-muted px-1">config.originalType</code>.
            Substitua manualmente no editor antes de executar.
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {summary.unsupportedTypes.map((t) => (
              <li
                key={t}
                className="rounded border border-border bg-card px-2 py-0.5 font-mono text-[11px]"
              >
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "muted";
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        tone === "ok" && "border-emerald-500/30 bg-emerald-500/5",
        tone === "warn" && "border-amber-500/30 bg-amber-500/5",
        tone === "muted" && "border-border bg-muted/20",
      )}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
