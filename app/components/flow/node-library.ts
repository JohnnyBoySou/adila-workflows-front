import {
  Play,
  Webhook,
  Clock,
  FormInput,
  Mail,
  Workflow as WorkflowIcon,
  Globe,
  Send,
  Hash,
  Database,
  Wand2,
  GitBranch,
  GitMerge,
  Repeat,
  Timer,
  Split,
  Variable,
  FileJson,
  Table,
  Filter,
  ArrowLeftRight,
  StickyNote,
  MessageSquare,
  Square,
  Frame,
  type LucideIcon,
} from "lucide-react";

import type { Node } from "@xyflow/react";
import type { WorkflowNodeVariant } from "./workflow-node";

export type NodeCategory = "Gatilhos" | "Ações" | "Lógica" | "Dados" | "Anotações";

export type NodeLibraryEntry = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  category: NodeCategory;
  /** Constrói o nó na posição dada. */
  build: (position: { x: number; y: number }, nodeId: string) => Node;
};

function workflowEntry(
  id: string,
  label: string,
  description: string,
  icon: LucideIcon,
  color: string,
  category: NodeCategory,
  variant: WorkflowNodeVariant,
): NodeLibraryEntry {
  return {
    id,
    label,
    description,
    icon,
    color,
    category,
    build: (position, nodeId) => ({
      id: nodeId,
      type: "workflow",
      position,
      data: { title: label, description, variant },
    }),
  };
}

export const NODE_LIBRARY: NodeLibraryEntry[] = [
  // Gatilhos
  workflowEntry(
    "trigger-manual",
    "Início manual",
    "Disparo iniciado pelo usuário",
    Play,
    "text-emerald-500",
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "trigger-webhook",
    "Webhook",
    "Recebe uma chamada HTTP",
    Webhook,
    "text-emerald-500",
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "trigger-schedule",
    "Agendamento",
    "Executa em horários definidos",
    Clock,
    "text-emerald-500",
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "trigger-form",
    "Formulário",
    "Submissão de formulário externo",
    FormInput,
    "text-emerald-500",
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "trigger-email",
    "E-mail recebido",
    "Dispara ao receber um e-mail",
    Mail,
    "text-emerald-500",
    "Gatilhos",
    "trigger",
  ),

  // Ações
  workflowEntry(
    "action-http",
    "Requisição HTTP",
    "Chama uma API externa",
    Globe,
    "text-sky-500",
    "Ações",
    "action",
  ),
  workflowEntry(
    "action-send-email",
    "Enviar e-mail",
    "Notifica via e-mail",
    Send,
    "text-sky-500",
    "Ações",
    "action",
  ),
  workflowEntry(
    "action-slack",
    "Mensagem no Slack",
    "Posta em um canal do Slack",
    Hash,
    "text-sky-500",
    "Ações",
    "action",
  ),
  workflowEntry(
    "action-db",
    "Banco de dados",
    "Lê ou grava em uma tabela",
    Database,
    "text-sky-500",
    "Ações",
    "action",
  ),
  workflowEntry(
    "action-transform",
    "Transformar",
    "Aplica uma transformação no payload",
    Wand2,
    "text-sky-500",
    "Ações",
    "action",
  ),
  workflowEntry(
    "action-generic",
    "Ação genérica",
    "Tarefa customizada",
    WorkflowIcon,
    "text-sky-500",
    "Ações",
    "action",
  ),

  // Lógica
  workflowEntry(
    "logic-condition",
    "Condição",
    "Se / senão baseado em regra",
    GitBranch,
    "text-amber-500",
    "Lógica",
    "condition",
  ),
  workflowEntry(
    "logic-switch",
    "Switch",
    "Múltiplos caminhos por valor",
    Split,
    "text-amber-500",
    "Lógica",
    "condition",
  ),
  workflowEntry(
    "logic-loop",
    "Loop",
    "Repete para cada item",
    Repeat,
    "text-amber-500",
    "Lógica",
    "condition",
  ),
  workflowEntry(
    "logic-delay",
    "Aguardar",
    "Pausa por um intervalo",
    Timer,
    "text-amber-500",
    "Lógica",
    "condition",
  ),
  workflowEntry(
    "logic-merge",
    "Mesclar",
    "Combina múltiplos caminhos",
    GitMerge,
    "text-amber-500",
    "Lógica",
    "condition",
  ),
  workflowEntry("logic-end", "Fim", "Encerra o workflow", Square, "text-rose-500", "Lógica", "end"),

  // Dados
  workflowEntry(
    "data-variable",
    "Variável",
    "Define ou lê uma variável",
    Variable,
    "text-violet-500",
    "Dados",
    "action",
  ),
  workflowEntry(
    "data-json",
    "Parse JSON",
    "Converte string em objeto",
    FileJson,
    "text-violet-500",
    "Dados",
    "action",
  ),
  workflowEntry(
    "data-csv",
    "Ler CSV",
    "Importa linhas de um CSV",
    Table,
    "text-violet-500",
    "Dados",
    "action",
  ),
  workflowEntry(
    "data-filter",
    "Filtrar",
    "Mantém apenas itens válidos",
    Filter,
    "text-violet-500",
    "Dados",
    "action",
  ),
  workflowEntry(
    "data-map",
    "Mapear campos",
    "Renomeia/transforma campos",
    ArrowLeftRight,
    "text-violet-500",
    "Dados",
    "action",
  ),

  // Anotações
  {
    id: "annotation-sticky",
    label: "Sticky note",
    description: "Anotação rápida em post-it",
    icon: StickyNote,
    color: "text-yellow-500",
    category: "Anotações",
    build: (position, nodeId) => ({
      id: nodeId,
      type: "sticky",
      position,
      width: 180,
      height: 140,
      data: { text: "", color: "yellow" },
    }),
  },
  {
    id: "annotation-comment",
    label: "Comentário",
    description: "Comentário breve no fluxo",
    icon: MessageSquare,
    color: "text-yellow-500",
    category: "Anotações",
    build: (position, nodeId) => ({
      id: nodeId,
      type: "sticky",
      position,
      width: 200,
      height: 100,
      data: { text: "", color: "blue" },
    }),
  },
  {
    id: "annotation-container",
    label: "Frame / Grupo",
    description: "Circula uma área para agrupar nós",
    icon: Frame,
    color: "text-slate-500",
    category: "Anotações",
    build: (position, nodeId) => ({
      id: nodeId,
      type: "container",
      position,
      width: 400,
      height: 280,
      zIndex: -1,
      data: { label: "Grupo", color: "slate" },
    }),
  },
];

export const NODE_CATEGORIES: NodeCategory[] = [
  "Gatilhos",
  "Ações",
  "Lógica",
  "Dados",
  "Anotações",
];
