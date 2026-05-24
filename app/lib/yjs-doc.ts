/**
 * Helpers de Y.Doc para sincronização do canvas de workflow.
 *
 * O doc tem duas Y.Map<key, JSON>: "nodes" (key=node.id) e "edges"
 * (key=`${from}::${to}::${label ?? ''}`, já que PersistedEdge não tem id).
 * Cada nó/edge é armazenado como objeto JSON cru — assim o diff é por
 * entidade, evitando que renomear/mover um nó sobrescreva edições
 * simultâneas em outro.
 */
import * as Y from "yjs";

import type { PersistedDefinition, PersistedEdge, PersistedNode } from "~/components/flow/definition";

export function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function base64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return arr;
}

function edgeKey(e: PersistedEdge): string {
  return `${e.from}::${e.to}::${e.label ?? ""}`;
}

export function readFromDoc(doc: Y.Doc): PersistedDefinition {
  const yNodes = doc.getMap("nodes");
  const yEdges = doc.getMap("edges");
  const nodes: PersistedNode[] = [];
  const edges: PersistedEdge[] = [];
  yNodes.forEach((v) => {
    if (v && typeof v === "object") nodes.push(v as PersistedNode);
  });
  yEdges.forEach((v) => {
    if (v && typeof v === "object") edges.push(v as PersistedEdge);
  });
  return { nodes, edges };
}

export function isDocEmpty(doc: Y.Doc): boolean {
  return doc.getMap("nodes").size === 0 && doc.getMap("edges").size === 0;
}

/**
 * Reescreve o doc para refletir a definition dada, em uma transaction única
 * (a `origin` se propaga para os listeners `doc.on('update', ...)`).
 *
 * Faz diff por chave + por shape JSON para evitar gerar Op sem mudança real,
 * o que economiza patches no backend e tráfego no WS.
 */
export function syncToDoc(doc: Y.Doc, def: PersistedDefinition, origin: unknown) {
  doc.transact(() => {
    const yNodes = doc.getMap<unknown>("nodes");
    const yEdges = doc.getMap<unknown>("edges");

    const wantNodeIds = new Set<string>();
    for (const n of def.nodes) {
      wantNodeIds.add(n.id);
      const prev = yNodes.get(n.id);
      if (!shallowJsonEqual(prev, n)) yNodes.set(n.id, n);
    }
    for (const key of Array.from(yNodes.keys())) {
      if (!wantNodeIds.has(key)) yNodes.delete(key);
    }

    const wantEdgeKeys = new Set<string>();
    for (const e of def.edges) {
      const k = edgeKey(e);
      wantEdgeKeys.add(k);
      const prev = yEdges.get(k);
      if (!shallowJsonEqual(prev, e)) yEdges.set(k, e);
    }
    for (const key of Array.from(yEdges.keys())) {
      if (!wantEdgeKeys.has(key)) yEdges.delete(key);
    }
  }, origin);
}

function shallowJsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
