/**
 * Dropdown que lista connections de DB cadastradas pro workflow corrente.
 *
 * Reutilizável em qualquer node panel que precise referenciar uma DB
 * (postgres, redis). Filtra por `kind` quando informado. Mostra a kind
 * e o ambiente (ou "default") como sublinha.
 *
 * Não inclui UI pra criar/editar — esse fluxo vive no
 * `ConnectionsManagerDialog` (botão "Gerenciar…" abre o gerenciador).
 */
import { useEffect, useState } from "react";
import { Database, ExternalLink, RefreshCw } from "lucide-react";

import { useWorkflowId } from "~/components/flow/workflow-context";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import * as dbConnections from "~/services/database-connections";

interface ConnectionPickerProps {
  kind: dbConnections.DatabaseConnectionKind;
  value: string | undefined;
  onChange: (ref: string | undefined) => void;
  /** Botão "Gerenciar" abre o dialog de CRUD; controlado pelo caller. */
  onManageClick?: () => void;
  label?: string;
  required?: boolean;
  /**
   * Como o `value` é persistido na config do node:
   *  - "name" (default novo): emite o nome lógico ("db_main"). Em runtime o
   *    worker resolve com fallback default → env-specific, permitindo
   *    promover a mesma versão entre ambientes sem reescrever o canvas.
   *  - "id": modo legado — emite o UUID da linha (pinned). Use só pra
   *    workflows antigos que ainda não migraram.
   */
  valueKind?: "id" | "name";
}

export function ConnectionPicker({
  kind,
  value,
  onChange,
  onManageClick,
  label = "Connection",
  required = false,
  valueKind = "name",
}: ConnectionPickerProps) {
  const workflowId = useWorkflowId();
  const [items, setItems] = useState<dbConnections.DatabaseConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refetch quando o workflow ou o kind muda.
  const reload = async () => {
    if (!workflowId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await dbConnections.list(workflowId, { kind });
      setItems(rows);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, kind]);

  // Em modo "name", colapsamos múltiplas linhas com o mesmo nome lógico
  // (default + overrides por env) numa única entrada — o nome é a referência
  // canônica que o node guarda. Preferimos a linha de default (env=null) pro
  // metadata mostrado, mas como o emit é só o name, qualquer uma serve.
  const listed =
    valueKind === "name"
      ? Array.from(
          items
            .reduce<Map<string, dbConnections.DatabaseConnection>>((acc, c) => {
              const existing = acc.get(c.name);
              if (!existing || (!c.environmentId && existing.environmentId)) {
                acc.set(c.name, c);
              }
              return acc;
            }, new Map())
            .values(),
        )
      : items;

  const matchValue = (c: dbConnections.DatabaseConnection) =>
    valueKind === "name" ? c.name : c.id;
  const selected = listed.find((c) => matchValue(c) === value);
  const valueMissing = value && !selected;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </Label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-6"
            onClick={() => void reload()}
            disabled={loading}
            aria-label="Recarregar lista"
            title="Recarregar"
          >
            <RefreshCw className={loading ? "size-3 animate-spin" : "size-3"} />
          </Button>
          {onManageClick && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={onManageClick}
            >
              <ExternalLink className="size-3" /> Gerenciar
            </Button>
          )}
        </div>
      </div>

      <Select value={value ?? ""} onValueChange={(v) => onChange(v || undefined)}>
        <SelectTrigger className="w-full">
          <SelectValue
            placeholder={
              loading
                ? "Carregando…"
                : items.length === 0
                  ? `Nenhuma connection ${kind} cadastrada`
                  : `Selecione uma connection ${kind}`
            }
          />
        </SelectTrigger>
        <SelectContent>
          {listed.map((c) => {
            const v = matchValue(c);
            // Em modo "name" todas as variantes do mesmo name colapsaram numa
            // entrada — o badge "ref" sinaliza que a resolução é por nome com
            // fallback de env, não pinada na linha.
            const badgeLabel =
              valueKind === "name" ? "ref" : c.environmentId ? "env" : "default";
            return (
              <SelectItem key={c.id} value={v}>
                <div className="flex items-center gap-2">
                  <Database className="size-3.5 shrink-0 opacity-60" />
                  <span className="font-medium">{c.name}</span>
                  <Badge variant="outline" className="ml-auto h-4 px-1 text-[10px]">
                    {badgeLabel}
                  </Badge>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {valueMissing && (
        <p className="text-xs text-destructive">
          Connection selecionada não existe mais — escolha outra.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
