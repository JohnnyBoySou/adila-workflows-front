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

## 💡 Backlog estratégico — além do pipeline

Ideias categorizadas pra evoluir o produto. Cada bloco é independente —
pode ser puxado pra sprint sem depender dos itens P0/P1/P2 acima.

Convenção: **S** = 1 sessão, **M** = 2-3 sessões, **L** = 1+ semana.

---

### 🎨 UX e produtividade no editor

- **[S] Command palette (Cmd+K)** — modal global com busca fuzzy: "publicar
  versão", "abrir workflow X", "ir pra environment Y", "criar trigger".
  Lib: `cmdk`. Atalho universal pro power user — uma vez instalado, vira
  o entry point principal.
- **[S] Overlay de atalhos (?)** — modal que lista todos os hotkeys (`shift+A`,
  `space` pan, `delete`, etc.). Disparado por `?`. Hoje os atalhos só
  existem implícitos no `useFlowShortcuts`.
- **[M] Multi-select com bulk actions** — Shift+click pra somar à seleção,
  Cmd+A select all visíveis no canvas. Toolbar contextual: "duplicar
  N nós", "agrupar em container", "deletar todos", "mover pra folder".
- **[S] Search no canvas (Cmd+F)** — input flutuante. Filtra nós por
  label/type. Match destaca + faz `fitView` no primeiro. Útil em workflows
  com 50+ nós.
- **[M] Undo/redo persistente** — hoje provavelmente é só React state local.
  Stack de operações (add/remove/move/edit-config) em zustand com `temporal`
  middleware. Botões na top-bar + `Cmd+Z` / `Cmd+Shift+Z`. Limite 50
  operações.
- **[S] Auto-save com debounce + indicador** — ao invés de save manual,
  debounce 1500ms. Indicador no top-bar: `🟢 Salvo`, `🟡 Salvando…`,
  `🔴 Erro ao salvar (retry)`. Reduz fricção drasticamente.
- **[M] Comments inline nos nós** — botão "💬" no node toolbar abre
  popover de comentário. Persiste em `definition.nodes[].comment: string`.
  Aparece como balão flutuante. Coleta de TODOs e contexto pra time.
- **[S] Snap-to-grid configurável** — toggle no flow-toolbar (8/16/32px).
  Hoje provavelmente é fixo. Permite alinhar finamente quando quer.
- **[M] Drag-and-drop de templates** — sidebar com lista de "snippets"
  (sub-grafos prontos: "GET → JSON parse → DB insert"). Arrasta pro canvas,
  insere nós com edges. Carrega de tabela `workflow_templates`.

---

### 🐛 Execução e debugging

- **[M] Inspetor de variáveis lateral** — drawer que mostra estado do run
  ao vivo: `env`, `input`, `$node.X.output` por nó já executado. Atualiza
  via SSE (já temos `run-events`). Vital pra debug.
- **[M] Replay de run** — botão "▶ Re-rodar" num run finalizado. Pega o
  mesmo input + env + pinnedData e dispara. Útil quando configura nó e
  quer testar com payload real anterior.
- **[L] Step-by-step debug** — modo onde o run pausa entre cada nó. UI
  mostra estado, botão "▶ Próximo nó", "⏭️ Skip", "🔧 Editar input do
  próximo". Backend precisa do counterparte (item L do back).
- **[M] Breakpoints em nós** — flag visual no nó: "pausar aqui". Run em
  modo debug para antes de executar. Persiste em `definition.nodes[].breakpoint:
  bool` (não publica em prod automaticamente — strip no publish).
- **[S] Preview de input/output em hover** — passar mouse sobre uma edge
  mostra tooltip com o output do nó-fonte do último run. JSON formatado
  compacto.
- **[S] Diff visual lado a lado de versões** — ao escolher versão pra
  promover, mostrar canvas dual: v17 à esquerda, v18 à direita, nós
  alterados destacados. Usa o endpoint diff do backend (item 2 do back).
- **[M] Streaming de logs melhorado** — terminal-like no rodapé. Cores por
  level. Filtro por nodeId. Pause/resume. Search. Hoje provavelmente é só
  lista append-only.

---

### 👥 Colaboração

- **[L] Presence (cursores)** — WebSocket compartilhado: avatares dos
  usuários ativos no canvas, cursor com nome. Hoje workspace é single-user
  silently. Lib: `liveblocks` ou solução custom com Yjs.
- **[L] Edição colaborativa em tempo real** — CRDT (Yjs) sincroniza
  `definition` entre clientes. Last-writer-wins por nó. Bem complexo —
  só puxar se demanda real (multi-editor frequente).
- **[M] Activity feed por workflow** — sidebar "atividade" mostrando:
  "lai editou nó HTTP há 2min", "johnny promoveu v17 → v18 há 1h".
  Consome audit-logs.
- **[M] Comentários por workflow** — thread tipo Linear/Figma. Atrelado
  a um nó ou ao workflow geral. Mentions `@user`. Notificação.
- **[S] Share link com permissão temporária** — gerar URL com token
  view-only por 24h. Útil pra mostrar pra alguém sem dar acesso à org.

---

### 📱 Responsivo e mobile

- **[M] Modo view-only mobile** — UI mobile-friendly pra visualizar
  workflows, runs e logs. Editar não. Read-only com fitView automático.
- **[L] Touch gestures no canvas** — pinch zoom, two-finger pan, tap
  longo pra context menu. Hoje é mouse-only.
- **[S] Sidebar collapsível em telas médias** — auto-collapse em <1280px,
  expand on hover/click. Maximiza canvas em laptop pequeno.

---

### ⚡ Performance e arquitetura frontend

- **[M] Virtualization de listas** — `dashboard.workflows`,
  `dashboard.runs`, `dashboard.environments` ficam lentas com 500+ items.
  Lib: `@tanstack/react-virtual`. Threshold: virtualizar quando > 50.
- **[S] Code splitting por rota** — `React.lazy` por route file. React Router
  7 suporta direto. Reduz bundle inicial. Medir antes/depois com
  `bun run build --analyze`.
- **[M] React Query: prefetch + stale-while-revalidate audit** —
  configurar `staleTime` apropriado por entidade: workflows 30s, runs 5s,
  audit-logs 60s. Prefetch ao hover em links.
- **[M] Memoization audit** — perfilar com React DevTools Profiler.
  Identificar re-renders caros (provável suspeito: canvas re-render full
  em cada drag). Memoizar `<WorkflowNode>` por config + status.
- **[S] Bundle analyzer + dependency audit** — `bun run build` + olhar
  treemap. Achar libs grandes sem uso (peso alto, sem benefício). Substituir
  ou tree-shake.
- **[L] Edge SSR pra páginas públicas** — landing, docs, workflow
  template público — todas server-rendered. React Router 7 + edge runtime.

---

### ♿ Acessibilidade

- **[M] Navegação por teclado completa** — Tab order lógico, focus visible,
  aria-labels em todos os botões. Auditar com axe DevTools.
- **[M] Screen reader support** — labels descritivos no canvas: "Nó HTTP,
  3 saídas conectadas, status: sucesso". Hoje canvas é opaco pra leitores.
- **[S] High contrast mode** — variante do tema com WCAG AAA. Toggle nas
  settings. Útil pra usuários com baixa visão e em telas externas.
- **[S] Focus ring consistente** — auditoria de `outline` / `ring` em todos
  os interactive elements. Usar variável CSS única `--ring`.
- **[M] Reduce motion respeitado** — `prefers-reduced-motion`: desliga
  animação de edges (item 8 do gradient), transitions de modal, etc.

---

### 🎯 Features de produto

- **[M] Templates marketplace** — galeria de workflows prontos por categoria
  (e-commerce, CRM, dados, DevOps). Clicar = clona pra org. Tabela
  `workflow_templates` no back já listada.
- **[M] Forms públicos como trigger** — UI pra desenhar form (drag campos),
  gera URL pública. Submit → dispara workflow. Roda em paralelo ao
  webhook trigger.
- **[L] Marketplace de nós custom** — terceiros publicam nós (NPM-like)
  com schema + ícone. UI lista, click "instala" no plan da org. Modelo
  de revenue share.
- **[M] Variables & Secrets sidebar inline** — no flow editor, panel
  retrátil mostra todas vars do env atual. Drag uma variável pra dentro
  de um campo de config = insere `{{ env.X }}`.
- **[M] Run history per node (mini-sparkline)** — ao abrir config de um
  nó, mostrar gráfico das últimas 50 execuções (sucesso/falha/duração).
  Útil pra identificar nó instável.
- **[S] Bulk operations em runs** — selecionar N runs falhados →
  "Re-rodar todos" / "Cancelar todos" / "Exportar logs".
- **[M] Workflow folders nested** — hoje folders são flat? Permitir
  drag-and-drop pra aninhar. UI tipo file explorer.
- **[M] Saved filters / views** — em `dashboard.runs`, salvar filtro
  "falhas do workflow X últimas 24h" com nome → vira atalho na sidebar.

---

### 🔔 Notificações

- **[M] In-app notification center** — sino no top-bar com badge. Eventos:
  trigger.promoted, workflow.failed, version.published. Read/unread state.
- **[M] Email digest configurável** — daily/weekly summary por user/org:
  N runs, N falhas, top workflows. Setting por user.
- **[S] Browser push notifications** — opt-in. Notifica quando run que
  você disparou termina (sucesso ou falha). Vital pra runs longos.
- **[M] Slack integration outbound** — config nas settings: "postar em
  #ops-alerts quando workflow Y falhar". Diferente do nó Slack (que é
  intencional dentro do workflow); aqui é metadata do workflow.

---

### 🛠️ Developer experience

- **[M] Storybook dos componentes** — `node-config-dialog`, `connection-picker`,
  `workflow-node`, todos os primitivos. Vira documentação viva +
  facilita PRs visuais.
- **[L] Testes E2E com Playwright** — fluxos críticos: criar workflow,
  adicionar nó, salvar, disparar, ver output. Roda em CI no PR.
- **[M] Testes unitários nos services + hooks** — `services/triggers.ts`,
  `use-flow-shortcuts.ts`, `definition.ts` (parser/serializer).
  Cobertura mínima 70% nessas camadas.
- **[S] Visual regression** — Chromatic ou Percy nas pages-chave.
  Pega regressão visual no CSS sem ninguém clicar.
- **[S] Lint rules customizados** — proibir `useState` em components
  acima de N linhas, `console.log` em PR, import circular.
- **[M] Página `/dev` com debugging tools** — toggle pra ligar React
  Query devtools, ReactFlow devtools, override de feature flags, mock
  de SSE. Acessível só em `NODE_ENV !== production`.

---

### 🌐 i18n e localização

- **[M] Suporte a EN além de pt-BR** — `react-i18next`. Hoje strings estão
  hardcoded em PT. Extrair pra `locales/{pt,en}.json`. Crítico se for
  expandir além do BR.
- **[S] Formatação de números/datas localizada** — `Intl.NumberFormat`,
  `Intl.DateTimeFormat` em todo lugar. Hoje provavelmente tem `toFixed`
  e `toLocaleString("pt-BR")` espalhado.
- **[M] Timezone do user vs timezone do trigger** — trigger cron mostra
  `09:00 UTC` mas user em SP quer ver `06:00 -03`. Toggle ou auto-detect.

---

### 🎨 Design system

- **[M] Tema dark refinado** — auditar contraste, ajustar acentos, ícones
  e shadows. Tokens semânticos: `--bg-canvas`, `--bg-node`, `--bg-elevated`.
- **[S] Toast system unificado** — hoje `sonner`? Padronizar variantes:
  success/error/info/loading com ações inline ("desfazer", "ver run").
- **[M] Skeleton loaders consistentes** — toda lista/card tem skeleton
  matching layout. Hoje provavelmente tem mix de spinner + skeleton + nada.
- **[S] Empty states ilustrados** — "Nenhum workflow ainda" com SVG +
  CTA. "Nenhum run hoje" idem. Eleva percepção de produto.
- **[M] Animation system** — Framer Motion presets reutilizáveis:
  `fadeInUp`, `slideRight`, `scaleIn`. Hoje provavelmente cada componente
  reimpõe sua animação.

---

### 📊 Analytics e telemetria de uso

- **[M] PostHog/Mixpanel events** — track: workflow_created, version_published,
  trigger_promoted, ai_chat_used, error_seen. Dashboards de funil/retenção.
- **[S] Feature flags client** — toggleamento de features novas por org.
  Lib: PostHog feature flags ou ConfigCat.
- **[M] Performance monitoring (RUM)** — Sentry ou DataDog RUM. Captura
  LCP, INP, FID por rota. Identifica páginas lentas pra users reais.
- **[S] Error boundary com Sentry** — wrap em `<RootErrorBoundary>`.
  Stack trace + breadcrumbs vai pro Sentry. Hoje provavelmente erro
  branca a tela.

---

## 🗺️ Mapa de impacto vs esforço

```
        IMPACTO ALTO
              ▲
              │
   [1] Service versions         [Command palette]
   [4] UI promote               [Multi-select bulk]
   [3.2] Painel versões         [Replay de run]
   [Auto-save + indicador]
              │
   [Comments inline]            [Templates marketplace]
   [Streaming logs]             [Storybook]
              │                 [E2E Playwright]
   [Skeleton consistente]
   [Empty states]
              │
              └──────────────────────────────────►
                                       ESFORÇO ALTO
```

**Próximas 3 sessões recomendadas depois do P0**:
1. **Command palette (Cmd+K)** — destranca produtividade do power user.
2. **Auto-save + indicador** — remove a maior fricção do dia a dia.
3. **Replay de run** — eleva confiança em iterar configs.

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
