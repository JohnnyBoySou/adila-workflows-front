/**
 * Aba "Conexões" do WorkflowInfoDialog.
 *
 * View read-only de saúde: deriva requisitos a partir da `nodes` atual da
 * canvas (campos `requiredEnv` e `requiresConnection` declarados na
 * `node-library`) e valida contra o environment ativo:
 *
 *   - Connections de DB: agrupa por nome de ref usada nos nós postgres/redis,
 *     mostra status configurado/faltando, link "Gerenciar" abre o
 *     ConnectionsManagerDialog do workflow.
 *   - Env vars: agrega chaves esperadas por todos os nós, lista status
 *     por chave no env selecionado, link "Editar" leva à página do env.
 *
 * Nada é editado aqui — é dashboard. CRUD continua nas telas próprias
 * (única fonte de verdade).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Settings2, Webhook } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "~/lib/query-keys";
import * as triggersApi from "~/services/triggers";
import { WebhookTriggerExtras } from "./webhook-trigger-extras";

import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { NODE_LIBRARY } from "./node-library";
import type { NodeLibraryEntry } from "./node-library";
import type { PersistedNode } from "./definition";
import * as connectionsApi from "~/services/database-connections";
import type { DatabaseConnection } from "~/services/database-connections";
import * as environmentsApi from "~/services/environments";
import type { Environment } from "~/services/environments";
import * as envVarsApi from "~/services/environment-variables";
import type { EnvironmentVariable } from "~/services/environment-variables";

type Props = {
  workflowId: string;
  /** Snapshot dos nodes da canvas (formato persistido) — atualiza quando o dialog abre. */
  nodes: PersistedNode[];
  onOpenConnectionsManager: () => void;
};

type Requirement = {
  kind: "env" | "connection";
  key: string;
  /** node ids da canvas que pedem isso */
  usedBy: string[];
  /** "postgres" | "redis" só para kind=connection */
  connectionKind?: "postgres" | "redis";
};

export function WorkflowConnectionsSection({
  workflowId,
  nodes,
  onOpenConnectionsManager,
}: Props) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnvId, setActiveEnvId] = useState<string>("");
  const [envVars, setEnvVars] = useState<EnvironmentVariable[]>([]);
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);
  const [loadingEnvs, setLoadingEnvs] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Carrega environments uma vez. Pré-seleciona o default da org.
  useEffect(() => {
    let cancelled = false;
    setLoadingEnvs(true);
    environmentsApi
      .list()
      .then((list) => {
        if (cancelled) return;
        setEnvironments(list);
        const def = list.find((e) => e.isDefault) ?? list[0];
        if (def) setActiveEnvId(def.id);
      })
      .finally(() => {
        if (!cancelled) setLoadingEnvs(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Carrega vars do env ativo + connections do workflow quando muda.
  useEffect(() => {
    if (!activeEnvId) return;
    let cancelled = false;
    setLoadingDetails(true);
    Promise.all([
      envVarsApi.list(activeEnvId, false),
      connectionsApi.list(workflowId, { environmentId: activeEnvId }),
    ])
      .then(([vars, conns]) => {
        if (cancelled) return;
        setEnvVars(vars);
        setConnections(conns);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetails(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeEnvId, workflowId]);

  // Deriva requisitos da canvas. Para env vars, agrega chaves únicas com
  // a lista de nós que as pedem; para connections, agrupa por ref usado.
  const requirements = useMemo(() => derive(nodes), [nodes]);

  const envSet = useMemo(() => new Set(envVars.map((v) => v.key)), [envVars]);
  const envByKey = useMemo(
    () => new Map(envVars.map((v) => [v.key, v])),
    [envVars],
  );
  const connByName = useMemo(
    () => new Map(connections.map((c) => [c.name, c])),
    [connections],
  );

  // Nós webhook_trigger presentes no canvas
  const webhookNodes = useMemo(
    () => nodes.filter((n) => n.type === "webhook_trigger"),
    [nodes],
  );

  return (
    <div className="max-w-3xl space-y-6">
      {/* Webhooks ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Webhook className="size-3.5" /> Webhooks públicos
          </h3>
          <p className="text-xs text-muted-foreground">
            URLs públicas que disparam este workflow via HTTP.
          </p>
        </div>
        {webhookNodes.length === 0 ? (
          <Empty text="Nenhum nó Webhook na canvas. Adicione um para gerar uma URL pública." />
        ) : (
          <div className="space-y-3">
            {webhookNodes.map((node) => (
              <WebhookNodeEntry
                key={node.id}
                workflowId={workflowId}
                node={node}
              />
            ))}
          </div>
        )}
      </section>

      <div className="border-t border-border" />

      <div className="space-y-2">
        <Label htmlFor="conn-env">Environment</Label>
        <Select value={activeEnvId} onValueChange={setActiveEnvId} disabled={loadingEnvs}>
          <SelectTrigger id="conn-env" className="w-full max-w-sm">
            <SelectValue placeholder={loadingEnvs ? "Carregando…" : "Selecione"} />
          </SelectTrigger>
          <SelectContent>
            {environments.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name} {e.isDefault ? "(default)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Mostra o que os nós da canvas exigem e valida contra esse ambiente.
        </p>
      </div>

      {/* Credenciais tipadas (postgres/redis) ─────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Credenciais tipadas</h3>
            <p className="text-xs text-muted-foreground">
              Postgres/Redis com teste de conexão e introspecção de schema.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onOpenConnectionsManager}
            className="gap-1.5"
          >
            <Settings2 className="size-3.5" /> Gerenciar
          </Button>
        </div>
        {requirements.connections.length === 0 ? (
          <Empty text="Nenhum nó na canvas requer credencial tipada." />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {requirements.connections.map((req) => {
              const found = connByName.get(req.key);
              const ok = Boolean(found) && found?.kind === req.connectionKind;
              return (
                <li
                  key={`conn-${req.key}-${req.connectionKind}`}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <StatusIcon ok={ok} loading={loadingDetails} />
                      <span className="font-mono">{req.key}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {req.connectionKind}
                      </span>
                    </div>
                    <UsedBy ids={req.usedBy} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {ok ? "Configurada" : "Faltando"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Env vars (secrets KV) ────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Variáveis de ambiente</h3>
            <p className="text-xs text-muted-foreground">
              Secrets KV genéricos (S3, SMTP, API keys, webhooks).
            </p>
          </div>
          {activeEnvId && (
            <Button asChild type="button" size="sm" variant="outline" className="gap-1.5">
              <Link to={`/dashboard/environments/${activeEnvId}`}>
                <ExternalLink className="size-3.5" /> Editar
              </Link>
            </Button>
          )}
        </div>
        {requirements.envs.length === 0 ? (
          <Empty text="Nenhum nó na canvas requer variáveis de ambiente." />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {requirements.envs.map((req) => {
              const present = envSet.has(req.key);
              const entry = envByKey.get(req.key);
              return (
                <li key={`env-${req.key}`} className="flex items-center justify-between px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <StatusIcon ok={present} loading={loadingDetails} />
                      <span className="font-mono">{req.key}</span>
                      {entry?.isSecret && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                          secret
                        </span>
                      )}
                    </div>
                    <UsedBy ids={req.usedBy} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {present ? "Definida" : "Faltando"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function WebhookNodeEntry({
  workflowId,
  node,
}: {
  workflowId: string;
  node: PersistedNode;
}) {
  const triggersQuery = useQuery({
    queryKey: queryKeys.triggers.list(workflowId),
    queryFn: () => triggersApi.list(workflowId, "webhook"),
  });

  const trigger = triggersQuery.data?.find((t) => t.nodeId === node.id) ?? null;
  const title = (node.config as Record<string, unknown> | undefined)?.title as string | undefined;

  return (
    <div className="rounded-md border border-border bg-muted/20">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Webhook className="size-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{title ?? "Webhook"}</span>
        <span className="font-mono text-[10px] text-muted-foreground">({node.id.slice(0, 8)})</span>
        {trigger && (
          <span
            className={`ml-auto flex items-center gap-1 text-[10px] font-medium ${trigger.enabled ? "text-emerald-600" : "text-muted-foreground"}`}
          >
            <span className={`size-1.5 rounded-full ${trigger.enabled ? "bg-emerald-500" : "bg-muted-foreground"}`} />
            {trigger.enabled ? "Ativo" : "Inativo"}
          </span>
        )}
      </div>
      <div className="px-3 pb-3">
        <WebhookTriggerExtras
          workflowId={workflowId}
          nodeId={node.id}
          responseMode={
            (node.config as Record<string, unknown> | undefined)?.responseMode as
              | "async"
              | "sync"
              | undefined
          }
          responseTimeoutMs={
            (node.config as Record<string, unknown> | undefined)?.responseTimeoutMs as
              | number
              | undefined
          }
        />
      </div>
    </div>
  );
}

function derive(nodes: PersistedNode[]): {
  envs: Requirement[];
  connections: Requirement[];
} {
  const libByType = new Map<string, NodeLibraryEntry>();
  for (const entry of NODE_LIBRARY) {
    if (entry.nodeType) libByType.set(entry.nodeType, entry);
  }

  const envMap = new Map<string, Set<string>>();
  // Connections agrupadas por (nome, kind) — kind discrimina ref repetido entre tipos.
  const connMap = new Map<string, { kind: "postgres" | "redis"; users: Set<string> }>();

  for (const node of nodes) {
    const lib = libByType.get(node.type);
    if (!lib) continue;

    if (lib.requiredEnv) {
      for (const key of lib.requiredEnv) {
        if (!envMap.has(key)) envMap.set(key, new Set());
        envMap.get(key)!.add(node.id);
      }
    }
    if (lib.requiresConnection) {
      const cfg = node.config ?? {};
      const ref = (cfg.connectionRef ?? cfg.connectionId) as unknown;
      if (typeof ref === "string" && ref) {
        const k = `${ref}::${lib.requiresConnection}`;
        if (!connMap.has(k)) {
          connMap.set(k, { kind: lib.requiresConnection, users: new Set() });
        }
        connMap.get(k)!.users.add(node.id);
      }
    }
  }

  const envs: Requirement[] = [...envMap.entries()]
    .map(([key, users]) => ({ kind: "env" as const, key, usedBy: [...users] }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const connections: Requirement[] = [...connMap.entries()]
    .map(([k, v]) => {
      const name = k.split("::")[0]!;
      return {
        kind: "connection" as const,
        key: name,
        connectionKind: v.kind,
        usedBy: [...v.users],
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  return { envs, connections };
}

function StatusIcon({ ok, loading }: { ok: boolean; loading: boolean }) {
  if (loading) return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
  if (ok) return <CheckCircle2 className="size-3.5 text-emerald-500" />;
  return <AlertCircle className="size-3.5 text-amber-500" />;
}

function UsedBy({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  const preview = ids.slice(0, 3).join(", ");
  const extra = ids.length > 3 ? ` +${ids.length - 3}` : "";
  return (
    <p className="mt-0.5 text-[11px] text-muted-foreground">
      Usado por {ids.length} nó{ids.length > 1 ? "s" : ""}: {preview}
      {extra}
    </p>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
      {text}
    </p>
  );
}
