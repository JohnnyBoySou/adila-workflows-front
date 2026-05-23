/**
 * Mock de dados de workflows / pastas / ambientes.
 *
 * Substituir por chamadas ao `~/services/workflows.ts` quando o backend
 * estiver disponível. A forma dos objetos já segue os tipos do service,
 * então a troca é só nos `useLoader` / loaders da rota.
 */
import type { Environment, Folder, WorkflowSummary } from "~/services/workflows";

export const environments: Environment[] = [
  { id: "production", name: "Produção" },
  { id: "staging", name: "Staging" },
  { id: "development", name: "Desenvolvimento" },
];

export const folders: Folder[] = [
  {
    id: "f-marketing",
    name: "Marketing",
    parentId: null,
    environmentId: "production",
    updatedAt: "2026-05-20T18:00:00Z",
  },
  {
    id: "f-sales",
    name: "Vendas",
    parentId: null,
    environmentId: "production",
    updatedAt: "2026-05-18T12:30:00Z",
  },
  {
    id: "f-onboarding",
    name: "Onboarding",
    parentId: null,
    environmentId: "production",
    updatedAt: "2026-05-15T09:10:00Z",
  },
  {
    id: "f-outbound",
    name: "Outbound",
    parentId: "f-marketing",
    environmentId: "production",
    updatedAt: "2026-05-21T15:00:00Z",
  },
  {
    id: "f-inbound",
    name: "Inbound",
    parentId: "f-marketing",
    environmentId: "production",
    updatedAt: "2026-05-19T11:20:00Z",
  },
  {
    id: "f-experimental",
    name: "Experimental",
    parentId: null,
    environmentId: "staging",
    updatedAt: "2026-05-22T08:00:00Z",
  },
];

export const workflows: WorkflowSummary[] = [
  {
    id: "w-onb-lead",
    name: "Onboarding de lead",
    status: "active",
    runsLast24h: 142,
    lastRunAt: "2026-05-22T20:10:00Z",
    updatedAt: "2026-05-22T14:00:00Z",
    folderId: "f-onboarding",
    environmentId: "production",
  },
  {
    id: "w-churn-risk",
    name: "Notificar churn risk",
    status: "active",
    runsLast24h: 87,
    lastRunAt: "2026-05-22T19:55:00Z",
    updatedAt: "2026-05-21T17:22:00Z",
    folderId: null,
    environmentId: "production",
  },
  {
    id: "w-crm-sync",
    name: "Sincronizar CRM",
    status: "paused",
    runsLast24h: 0,
    lastRunAt: "2026-05-20T08:00:00Z",
    updatedAt: "2026-05-20T08:30:00Z",
    folderId: "f-sales",
    environmentId: "production",
  },
  {
    id: "w-weekly-summary",
    name: "Resumo semanal",
    status: "active",
    runsLast24h: 1,
    lastRunAt: "2026-05-22T07:00:00Z",
    updatedAt: "2026-05-15T12:00:00Z",
    folderId: null,
    environmentId: "production",
  },
  {
    id: "w-outbound-cold",
    name: "Cadência cold outbound",
    status: "active",
    runsLast24h: 312,
    lastRunAt: "2026-05-22T20:30:00Z",
    updatedAt: "2026-05-22T16:45:00Z",
    folderId: "f-outbound",
    environmentId: "production",
  },
  {
    id: "w-inbound-form",
    name: "Distribuir formulário inbound",
    status: "active",
    runsLast24h: 58,
    lastRunAt: "2026-05-22T20:05:00Z",
    updatedAt: "2026-05-19T10:15:00Z",
    folderId: "f-inbound",
    environmentId: "production",
  },
  {
    id: "w-lead-enrich",
    name: "Enriquecer lead",
    status: "draft",
    runsLast24h: 0,
    lastRunAt: null,
    updatedAt: "2026-05-22T11:00:00Z",
    folderId: "f-marketing",
    environmentId: "production",
  },
  {
    id: "w-stg-test",
    name: "Teste de notificação",
    status: "draft",
    runsLast24h: 0,
    lastRunAt: null,
    updatedAt: "2026-05-22T08:30:00Z",
    folderId: "f-experimental",
    environmentId: "staging",
  },
];
