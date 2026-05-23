# Pipeline de Versionamento e Promoção — TODO Frontend

> Contexto: o backend já implementou (sessão 2026-05-23):
> - **Passo A**: resolução de `database_connections` por nome lógico com fallback por ambiente (`connectionRef` ao invés de `connectionId`).
> - **Passo B**: pin de versão por trigger (`triggers.workflow_version_id` + endpoint `POST /workflows/:id/triggers/:triggerId/promote`).
>
> Falta o frontend pra fechar o ciclo `publicar → promover → rollback`.

---

## 🔴 P0 — Gaps que bloqueiam o pipeline de versionamento

### 1. Criar `services/workflow-versions.ts`

Não existe ainda. Endpoints já no backend:

| Verbo | Path | Função |
|-------|------|--------|
| GET   | `/workflows/:id/versions`         | Listar versões publicadas |
| POST  | `/workflows/:id/versions`         | Publicar snapshot do draft atual |
| GET   | `/workflows/:id/versions/:vid`    | Detalhe de uma versão (definition completa) |

**Estrutura sugerida** (espelhar `services/triggers.ts`):

```ts
export type WorkflowVersion = {
  id: string;
  workflowId: string;
  version: number;          // sequencial: 1, 2, 3, ...
  definition: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
};

export function list(workflowId: string): Promise<WorkflowVersion[]>;
export function publish(workflowId: string): Promise<WorkflowVersion>;
export function findById(workflowId: string, versionId: string): Promise<WorkflowVersion>;
```

Registrar query keys em `lib/query-keys.ts`:
```ts
workflowVersions: (workflowId: string) => ["workflow-versions", workflowId] as const,
```

---

### 2. Estender `services/triggers.ts`

#### 2.1 Adicionar campo `workflowVersionId` no tipo `Trigger`

```ts
export type Trigger = {
  // ... campos existentes
  /**
   * Quando setado, o trigger dispara EXATAMENTE essa versão. Quando `null`,
   * usa o comportamento legado (latest published / auto-publish do draft).
   */
  workflowVersionId: string | null;
};
```

#### 2.2 Adicionar `workflowVersionId?` em `CreateTriggerInput` e `UpdateTriggerInput`

Ambos os create variants (`CreateWebhookTriggerInput`, `CreateCronTriggerInput`) já podem aceitar:
```ts
workflowVersionId?: string | null;
```

#### 2.3 Adicionar função `promote`

```ts
/**
 * Move o pino de versão do trigger. Passar `null` despinpina (volta a
 * usar latest/auto). O backend valida que a versão pertence ao mesmo
 * workflow e registra em audit_log como `trigger.promoted`.
 */
export function promote(
  workflowId: string,
  triggerId: string,
  workflowVersionId: string | null,
): Promise<Trigger> {
  return unwrap(
    $fetch<Trigger>(`/workflows/${workflowId}/triggers/${triggerId}/promote`, {
      method: "POST",
      body: { workflowVersionId },
    }),
  );
}
```

---

### 3. UI "Versões" do workflow

#### 3.1 Botão "Publicar versão" no flow editor

Lugar provável: `components/flow/flow-top-bar.tsx`, ao lado do botão Save.

Comportamento:
- Modal de confirmação com summary do diff (qtd nós, qtd edges).
- Chama `workflowVersions.publish(workflowId)`.
- Toast "v18 publicada".
- Invalida queries de `workflowVersions` + lista de triggers.

#### 3.2 Painel "Versões"

Pode ser:
- **(a)** Sheet lateral acionado por um ícone "histórico" no flow-top-bar.
- **(b)** Tab dentro do `workflow-info-dialog.tsx` (recomendado, evita rota nova).

Conteúdo:
```
v18  ─  22/05 14:32  ─  johnny           [Restaurar como draft] [Comparar]
v17  ─  21/05 09:11  ─  johnny  (ativa)  [Restaurar como draft] [Comparar]
v16  ─  20/05 16:45  ─  lai              [Restaurar como draft] [Comparar]
```

"Ativa" = versão atualmente referenciada por algum trigger.

**Restaurar como draft**: carrega `version.definition` no canvas, marca dirty, não publica — usuário salva o draft pra propagar.

**Comparar**: opcional na v1. Quando implementar, diff de nós (adicionados/removidos/alterados) num modal.

---

### 4. UI de "Promote" no card do trigger

Lugar provável: onde quer que listemos triggers (provavelmente sheet de triggers do flow ou `dashboard.workflows.tsx`).

Para cada trigger:

```
┌─────────────────────────────────────────────┐
│ ⚡ prod-cron                  [enabled] [⚙] │
│ Versão: v17 [▼]                             │
│ Última execução: 23/05 09:00                │
└─────────────────────────────────────────────┘
```

Dropdown `Versão: v17 [▼]`:
- Lista versões (mais novas primeiro) + opção "Latest (auto)".
- Selecionar → modal de confirmação:
  ```
  Promover trigger "prod-cron"?
  De: v17 (publicada 21/05 09:11)
  Para: v18 (publicada 22/05 14:32)
  Mudanças: 3 nós alterados, 1 adicionado
  [Cancelar] [Promover]
  ```
- Confirma → `triggers.promote(workflowId, triggerId, versionId)`.
- Toast "Trigger prod-cron promovido pra v18".

**Edge case**: "Despinpinar" = selecionar "Latest (auto)" → chama `promote(..., null)`.

---

## 🟡 P1 — Pipeline A (resolução por nome)

### 5. Criar `redis-panel.tsx`

Hoje o nó Redis em `node-config/schemas.ts:109` usa o campo bruto `connectionString`. O `postgres-panel.tsx` já foi migrado pra `connectionRef`. Pra paridade:

1. Criar `components/flow/node-config/redis-panel.tsx` espelhando `postgres-panel.tsx`:
   - Lê `cfg.connectionRef ?? cfg.connectionId` (compat).
   - Usa `<ConnectionPicker valueKind="name" kind="redis" />`.
   - Emite `{ connectionRef: ref, connectionId: undefined, connectionString: undefined }`.
   - Sem schema introspection (não aplicável a Redis).

2. Plugar em `schemas.ts`:
   ```ts
   const redis: NodeConfigSchema = {
     // ...
     customPanel: RedisPanel,
     customPanelOwnsMeta: true,
   };
   ```

3. Deprecar `connectionString` no painel (continuar suportando read mas esconder no form).

---

### 6. Migrar definitions legadas `connectionId` → `connectionRef`

Workflows criados antes de hoje guardam `connectionId: "<uuid>"` nos node configs. O backend é retrocompatível (engine aceita ambos), mas a UI nova em modo `name` mostra vazio quando vê só UUID.

**Opção A — Auto-migração no load do editor** (recomendada):

Em `workflow-canvas.tsx` ou `flow.tsx`, ao hidratar `definition`:
1. Percorrer nós.
2. Pra cada nó com `data.config.connectionId` (UUID) e sem `connectionRef`:
   - Buscar via `databaseConnections.list({ workflowId })` (já cacheado).
   - Achar o nome lógico daquele UUID.
   - Substituir em memória: `{ connectionRef: name, connectionId: undefined }`.
   - Marcar o canvas como dirty pra forçar salvar.
3. Mostrar toast informativo "Workflow migrado automaticamente — salve pra persistir".

**Opção B — Script CLI no backend**:

`back/scripts/migrate-connection-refs.ts` que varre `workflows.definition` e `workflow_versions.definition` substituindo `connectionId` por `connectionRef` baseado em `database_connections`. Cobre versões já publicadas que ninguém vai reabrir.

Idealmente as duas — A pra ergonomia, B pra completude.

---

## 🟢 P2 — Polimento

### 7. Histórico de releases (audit log)

Backend já grava `trigger.promoted` com `metadata: { from, to }`. Hoje fica enterrado.

UI mínima: tab "Histórico" no `workflow-info-dialog.tsx` consumindo `GET /audit-logs?resourceType=trigger&workflowId=:id`:

```
22/05 14:32 — johnny promoveu trigger "prod-cron" de v16 → v17
21/05 09:11 — johnny publicou versão v17
20/05 16:45 — lai promoveu trigger "stage-cron" de v15 → v16
```

(Verificar se `services/audit-logs.ts` existe; provavelmente não — criar.)

---

### 8. Banner "Draft à frente de prod"

No flow editor, comparar:
- `workflow.definition` (draft atual).
- Versão pinada do trigger mais "produtivo" (ou mais antigo / mais usado).

Se diferentes, banner sutil no topo:
```
⚠ Draft à frente da versão em produção (v17). [Publicar v18]
```

Heurística de "qual trigger é o prod": o que tem `environmentId` apontando pra environment chamado "production", ou o mais antigo, ou simplesmente "qualquer trigger com versão pinada".

---

### 9. Auditar outros painéis que aceitam connection

Hoje só Postgres e Redis. Mas:
- `execute-workflow-panel.tsx` — não usa, OK.
- `http-request-panel.tsx` — não usa, OK.
- Novos nós futuros (MongoDB, MySQL, etc.) devem nascer com `ConnectionPicker valueKind="name"`.

Adicionar à documentação interna: **"todo novo nó que aceita conexão DEVE persistir `connectionRef` (nome), nunca `connectionId` (UUID)"**.

---

## 📋 Ordem de execução sugerida

Cada item é uma sessão isolada. Marcar conforme completar:

- [ ] **(1)** `services/workflow-versions.ts` + query keys
- [ ] **(2)** Estender `services/triggers.ts` com `workflowVersionId` + `promote()`
- [ ] **(3.1)** Botão "Publicar versão" no flow-top-bar
- [ ] **(3.2)** Painel "Versões" no workflow-info-dialog
- [ ] **(4)** UI de promote no card do trigger (dropdown + modal de confirmação)
- [ ] **(5)** `redis-panel.tsx` espelhando o postgres
- [ ] **(6a)** Auto-migração de `connectionId` legado no load do editor
- [ ] **(6b)** Script CLI `migrate-connection-refs.ts` no back (opcional)
- [ ] **(7)** Tab "Histórico" no workflow-info-dialog
- [ ] **(8)** Banner "Draft à frente"
- [ ] **(9)** Audit final dos painéis de connection

**Mínimo viável pra liberar o ciclo**: itens (1), (2), (3.1), (3.2), (4). Daí o usuário já consegue `publicar → promover → rollback` clicando.

---

## 🧪 Plano de teste manual ao final

1. Criar workflow `wf_test` com nó Postgres apontando pra `connectionRef: "db_main"`.
2. Cadastrar duas connections com nome `db_main`: uma com `environmentId=null` (default, dev), outra com `environmentId=prod` (override prod).
3. Cadastrar dois triggers cron: `dev-cron` (environment dev), `prod-cron` (environment prod).
4. Publicar v1. Disparar ambos → confirmar que `dev-cron` usa a connection default e `prod-cron` usa o override.
5. Editar workflow, publicar v2.
6. Promover só `dev-cron` pra v2 — `prod-cron` continua em v1.
7. Disparar ambos → `dev` roda v2, `prod` roda v1.
8. Rollback: promover `dev-cron` de volta pra v1.
9. Despinpinar `dev-cron` (`workflowVersionId: null`) → próximo disparo usa latest.
10. Verificar `audit_logs` no DB: deve ter `trigger.promoted` com from/to corretos.

---

## 🔗 Referências cruzadas (backend já implementado)

| Arquivo | O que tem |
|---------|-----------|
| `back/src/features/database-connections/repository.ts:151` | `resolve(workflowId, ref, environmentId)` com dispatch UUID/nome |
| `back/src/features/triggers/controller.ts:155` | método `promote()` |
| `back/src/features/triggers/router.ts:122` | endpoint `POST /:triggerId/promote` |
| `back/src/features/triggers/schema.ts` | `promoteTriggerBody` + `workflowVersionId` em create/update |
| `back/src/features/workflows/controller.ts:121` | `run()` aceita `opts.workflowVersionId` |
| `back/scripts/worker.ts:86` | closure `resolveConnection` com env-fallback |
| `back/scripts/worker.ts:231` | cron worker propaga `trigger.workflowVersionId` |
| `back/src/features/triggers/webhook-router.ts:75` | webhook router propaga `trigger.workflowVersionId` |
| `back/drizzle/0010_daffy_morbius.sql` | migration adicionando `triggers.workflow_version_id` |
