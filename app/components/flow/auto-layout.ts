/**
 * Auto-organizar canvas.
 *
 * Resolve dois problemas práticos do editor:
 *   1. Layout — nós soltos em (0,0) ou ainda no offset bruto do n8n ficam
 *      ilegíveis. Aplicamos um layered layout left→right (compatível com a
 *      convenção do WorkflowNode: target à esquerda, source à direita).
 *   2. Higiene do grafo — edges duplicadas, self-loops e edges órfãs
 *      (referenciam nós que não existem mais) confundem o executor e o
 *      próprio React Flow. Limpamos no mesmo passe.
 *
 * O algoritmo é Sugiyama-lite, sem dependência externa:
 *   - Constrói o subgrafo só com nós executáveis (sticky/container ficam
 *     onde estão — são anotações visuais que o usuário posicionou de
 *     propósito).
 *   - Atribui camadas via longest-path-from-roots; back-edges (ciclo) caem
 *     na mesma camada do alvo, sem propagar.
 *   - Ordena cada camada por barycenter dos vizinhos (2 sweeps pra reduzir
 *     cruzamentos sem virar O(n³)).
 *   - Distribui em grid: x = layer * (NODE_W + H_GAP), y centralizado pela
 *     mediana da camada anterior.
 *   - Orphans (sem nenhuma edge) ganham uma linha de "garagem" abaixo.
 *   - Snap final em GRID pra alinhamento visual.
 */
import type { Edge, Node } from "@xyflow/react";

// Tipos puramente visuais — não entram no layout do fluxo executável.
const VISUAL_TYPES = new Set(["sticky", "container"]);

// Dimensões aproximadas do WorkflowNode renderizado (basta pra spacing;
// se o nó cresce com descrição, o gap absorve).
const NODE_W = 220;
const NODE_H = 90;
const H_GAP = 80; // espaço horizontal entre camadas
const V_GAP = 40; // espaço vertical entre nós da mesma camada
const GRID = 8; // snap final
const ORIGIN_X = 80;
const ORIGIN_Y = 80;

export interface AutoLayoutStats {
  /** Nós executáveis reposicionados. */
  layoutedNodes: number;
  /** Camadas geradas (profundidade do fluxo). */
  layers: number;
  /** Nós sem edges movidos pra linha de garagem. */
  orphans: number;
  /** Edges duplicadas (mesmo from/to/label) removidas. */
  removedDuplicates: number;
  /** Edges com from === to removidas. */
  removedSelfLoops: number;
  /** Edges apontando pra nós inexistentes removidas. */
  removedDangling: number;
}

export interface AutoLayoutResult {
  nodes: Node[];
  edges: Edge[];
  stats: AutoLayoutStats;
}

/**
 * Reorganiza nós e limpa edges. Pure function — não toca no state.
 *
 * Sticky notes e containers são preservados na posição original (são
 * anotações visuais; mexer neles costuma piorar mais do que melhorar).
 */
export function autoLayout(nodes: Node[], edges: Edge[]): AutoLayoutResult {
  const stats: AutoLayoutStats = {
    layoutedNodes: 0,
    layers: 0,
    orphans: 0,
    removedDuplicates: 0,
    removedSelfLoops: 0,
    removedDangling: 0,
  };

  // ── 1. Higiene das edges ───────────────────────────────────────────────
  const nodeIds = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const cleanEdges: Edge[] = [];
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
      stats.removedDangling++;
      continue;
    }
    if (e.source === e.target) {
      stats.removedSelfLoops++;
      continue;
    }
    // Label costuma estar em data.label (vindo do import) ou label direto.
    const label =
      (e.data as { label?: unknown } | undefined)?.label ??
      (typeof e.label === "string" ? e.label : "");
    const key = `${e.source}→${e.target}::${String(label)}`;
    if (seen.has(key)) {
      stats.removedDuplicates++;
      continue;
    }
    seen.add(key);
    cleanEdges.push(e);
  }

  // ── 2. Particiona: visuais ficam, executáveis vão pro layout ──────────
  const visualNodes = nodes.filter((n) => VISUAL_TYPES.has(n.type ?? ""));
  const flowNodes = nodes.filter((n) => !VISUAL_TYPES.has(n.type ?? ""));

  if (flowNodes.length === 0) {
    return { nodes: [...visualNodes], edges: cleanEdges, stats };
  }

  // ── 3. Constrói adjacência (apenas edges entre flowNodes) ─────────────
  const flowIds = new Set(flowNodes.map((n) => n.id));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const id of flowIds) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  for (const e of cleanEdges) {
    if (!flowIds.has(e.source) || !flowIds.has(e.target)) continue;
    outgoing.get(e.source)!.push(e.target);
    incoming.get(e.target)!.push(e.source);
  }

  // ── 4. Atribui camadas via longest-path from roots ────────────────────
  // Roots = nós sem incoming. Se não houver (todos em ciclo), pega o
  // primeiro flowNode como semente pra não estourar.
  const roots = flowNodes.filter((n) => (incoming.get(n.id)?.length ?? 0) === 0).map((n) => n.id);
  const seeds = roots.length > 0 ? roots : flowNodes.length > 0 ? [flowNodes[0]!.id] : [];

  const layer = new Map<string, number>();
  for (const id of seeds) layer.set(id, 0);

  // BFS-like — refazemos passes até estabilizar (no pior caso O(V*E),
  // aceitável pra workflows com poucas centenas de nós).
  let changed = true;
  let safety = flowNodes.length * 4;
  while (changed && safety-- > 0) {
    changed = false;
    for (const n of flowNodes) {
      const preds = incoming.get(n.id) ?? [];
      const known = preds.filter((p) => layer.has(p)).map((p) => layer.get(p)!);
      if (known.length === 0) {
        if (!layer.has(n.id)) {
          layer.set(n.id, 0);
          changed = true;
        }
        continue;
      }
      const candidate = Math.max(...known) + 1;
      const current = layer.get(n.id);
      if (current === undefined || candidate > current) {
        layer.set(n.id, candidate);
        changed = true;
      }
    }
  }
  // Garante que todos os flowNodes tenham camada (defensivo contra ciclos).
  for (const n of flowNodes) {
    if (!layer.has(n.id)) layer.set(n.id, 0);
  }

  // ── 5. Separa orphans (sem edges em nenhuma direção) ──────────────────
  const orphans: string[] = [];
  const layered: string[] = [];
  for (const n of flowNodes) {
    const isolated =
      (outgoing.get(n.id)?.length ?? 0) === 0 && (incoming.get(n.id)?.length ?? 0) === 0;
    if (isolated) orphans.push(n.id);
    else layered.push(n.id);
  }
  stats.orphans = orphans.length;

  // ── 6. Agrupa por camada ──────────────────────────────────────────────
  const byLayer = new Map<number, string[]>();
  for (const id of layered) {
    const l = layer.get(id) ?? 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(id);
  }
  const layerIndices = [...byLayer.keys()].sort((a, b) => a - b);
  stats.layers = layerIndices.length;

  // Ordenação inicial dentro de cada camada: preserva ordem Y original do
  // canvas pra não embaralhar quando o usuário já tinha uma intenção.
  const yByNode = new Map(flowNodes.map((n) => [n.id, n.position.y]));
  for (const l of layerIndices) {
    byLayer.get(l)!.sort((a, b) => (yByNode.get(a) ?? 0) - (yByNode.get(b) ?? 0));
  }

  // ── 7. Barycenter sweep pra reduzir cruzamentos ───────────────────────
  // 2 passadas (esquerda→direita, depois direita→esquerda) — suficiente
  // pra a maioria dos workflows triviais; mais que isso encarece sem ganho
  // visível em fluxos de até ~50 nós.
  const orderIndex = new Map<string, number>();
  const recomputeIndex = () => {
    orderIndex.clear();
    for (const l of layerIndices) {
      byLayer.get(l)!.forEach((id, i) => orderIndex.set(id, i));
    }
  };
  recomputeIndex();

  const barycenter = (ids: string[], neighborsOf: (id: string) => string[]) => {
    return ids
      .map((id) => {
        const ns = neighborsOf(id);
        const positions = ns.map((n) => orderIndex.get(n)).filter((p): p is number => p !== undefined);
        const bary = positions.length === 0 ? orderIndex.get(id) ?? 0 : positions.reduce((a, b) => a + b, 0) / positions.length;
        return { id, bary };
      })
      .sort((a, b) => a.bary - b.bary)
      .map((x) => x.id);
  };

  for (let sweep = 0; sweep < 2; sweep++) {
    // L → R: ordena cada camada pelo barycenter dos predecessores.
    for (const l of layerIndices) {
      const reordered = barycenter(byLayer.get(l)!, (id) =>
        (incoming.get(id) ?? []).filter((p) => layer.get(p) === l - 1),
      );
      byLayer.set(l, reordered);
    }
    recomputeIndex();
    // R → L: agora pelos sucessores.
    for (let i = layerIndices.length - 1; i >= 0; i--) {
      const l = layerIndices[i]!;
      const reordered = barycenter(byLayer.get(l)!, (id) =>
        (outgoing.get(id) ?? []).filter((s) => layer.get(s) === l + 1),
      );
      byLayer.set(l, reordered);
    }
    recomputeIndex();
  }

  // ── 8. Posiciona cada nó ──────────────────────────────────────────────
  const snap = (v: number) => Math.round(v / GRID) * GRID;
  const positionById = new Map<string, { x: number; y: number }>();

  // Altura total da camada mais cheia define o eixo central pras outras.
  const maxLayerCount = Math.max(0, ...[...byLayer.values()].map((l) => l.length));
  const tallestHeight = maxLayerCount * (NODE_H + V_GAP) - V_GAP;
  const centerY = ORIGIN_Y + tallestHeight / 2;

  for (const l of layerIndices) {
    const ids = byLayer.get(l)!;
    const height = ids.length * (NODE_H + V_GAP) - V_GAP;
    const startY = centerY - height / 2;
    ids.forEach((id, idx) => {
      positionById.set(id, {
        x: snap(ORIGIN_X + l * (NODE_W + H_GAP)),
        y: snap(startY + idx * (NODE_H + V_GAP)),
      });
    });
  }

  // Orphans: linha extra abaixo do maior fluxo.
  if (orphans.length > 0) {
    const orphanY = snap(centerY + tallestHeight / 2 + V_GAP * 2);
    orphans.forEach((id, idx) => {
      positionById.set(id, {
        x: snap(ORIGIN_X + idx * (NODE_W + H_GAP)),
        y: orphanY,
      });
    });
  }

  // ── 9. Aplica positions; visuais passam intactos ──────────────────────
  stats.layoutedNodes = positionById.size;
  const newNodes: Node[] = [];
  for (const n of nodes) {
    if (VISUAL_TYPES.has(n.type ?? "")) {
      newNodes.push(n);
      continue;
    }
    const pos = positionById.get(n.id);
    if (!pos) {
      newNodes.push(n);
      continue;
    }
    newNodes.push({ ...n, position: pos });
  }

  return { nodes: newNodes, edges: cleanEdges, stats };
}
