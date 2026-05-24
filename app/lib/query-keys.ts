/**
 * Query keys centralizadas.
 *
 * Manter as chaves aqui evita strings soltas espalhadas e dá um único ponto
 * para invalidar caches de forma consistente. Cada função devolve um array
 * compatível com `useQuery({ queryKey: ... })` e `invalidateQueries`.
 */

export const queryKeys = {
  folders: {
    all: ["folders"] as const,
    list: (parentId: string | null) => ["folders", "list", parentId ?? "root"] as const,
    detail: (id: string) => ["folders", "detail", id] as const,
    /** Cadeia de ancestrais — usada no breadcrumb da listagem. */
    path: (folderId: string | null) => ["folders", "path", folderId ?? "root"] as const,
  },
  workflows: {
    all: ["workflows"] as const,
    list: (
      folderId: string | null,
      page: number,
      filters?: { status?: string | null; q?: string | null },
    ) =>
      [
        "workflows",
        "list",
        folderId ?? "root",
        page,
        filters?.status ?? "all",
        filters?.q ?? "",
      ] as const,
    detail: (id: string) => ["workflows", "detail", id] as const,
  },
  runs: {
    all: ["runs"] as const,
    list: (workflowId: string) => ["runs", "list", workflowId] as const,
    detail: (workflowId: string, runId: string) =>
      ["runs", "detail", workflowId, runId] as const,
    steps: (workflowId: string, runId: string) =>
      ["runs", "steps", workflowId, runId] as const,
  },
  triggers: {
    all: ["triggers"] as const,
    list: (workflowId: string) => ["triggers", "list", workflowId] as const,
    invocations: (workflowId: string, triggerId: string, limit: number) =>
      ["triggers", "invocations", workflowId, triggerId, limit] as const,
    health: (workflowId: string, triggerId: string) =>
      ["triggers", "health", workflowId, triggerId] as const,
  },
  environments: {
    all: ["environments"] as const,
    list: () => ["environments", "list"] as const,
    detail: (id: string) => ["environments", "detail", id] as const,
    variables: (environmentId: string) => ["environments", "variables", environmentId] as const,
  },
  workflowNodes: {
    all: ["workflow-nodes"] as const,
    invocations: (workflowId: string, nodeId: string, limit: number) =>
      ["workflow-nodes", "invocations", workflowId, nodeId, limit] as const,
  },
  workflowMetrics: {
    all: ["workflow-metrics"] as const,
    throughput: (workflowId: string) =>
      ["workflow-metrics", "throughput", workflowId] as const,
    nodeDurations: (workflowId: string, runs: number) =>
      ["workflow-metrics", "node-durations", workflowId, runs] as const,
  },
  workflowVersions: {
    all: ["workflow-versions"] as const,
    list: (workflowId: string) => ["workflow-versions", "list", workflowId] as const,
    detail: (workflowId: string, versionId: string) =>
      ["workflow-versions", "detail", workflowId, versionId] as const,
  },
  comments: {
    all: ["comments"] as const,
    byWorkflow: (workflowId: string) => ["comments", "workflow", workflowId] as const,
  },
  auditLogs: {
    all: ["audit-logs"] as const,
    byWorkflow: (workflowId: string) => ["audit-logs", "workflow", workflowId] as const,
  },
  organization: {
    all: ["organization"] as const,
    members: (organizationId: string) => ["organization", "members", organizationId] as const,
    invitations: (organizationId: string) =>
      ["organization", "invitations", organizationId] as const,
  },
} as const;
