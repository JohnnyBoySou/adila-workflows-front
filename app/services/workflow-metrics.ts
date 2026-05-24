import { $fetch, unwrap } from "./index";

export type ThroughputQueueCounts = {
  waiting: number;
  prioritized: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

export type ThroughputResponse = {
  windowMinutes: number;
  finishedRuns: number;
  runsPerSecond: number;
  workerConcurrency: number;
  queue: ThroughputQueueCounts;
  series: { minute: string; runs: number }[];
};

export type NodeDuration = {
  nodeId: string;
  nodeType: string;
  executions: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  failures: number;
};

export type LoadTestInput = {
  count: number;
  priority?: number;
  input?: Record<string, unknown>;
};

export type LoadTestResponse = {
  requested: number;
  enqueued: number;
  failed: number;
  enqueueMs: number;
  runs: { runId: string; jobId?: string }[];
  errors: { index: number; error: string }[];
};

export function throughput(workflowId: string): Promise<ThroughputResponse> {
  return unwrap($fetch<ThroughputResponse>(`/workflows/${workflowId}/runs/throughput`));
}

export function nodeDurations(workflowId: string, runs = 50): Promise<NodeDuration[]> {
  return unwrap(
    $fetch<NodeDuration[]>(`/workflows/${workflowId}/runs/node-durations?runs=${runs}`),
  );
}

export function loadTest(workflowId: string, input: LoadTestInput): Promise<LoadTestResponse> {
  return unwrap(
    $fetch<LoadTestResponse>(`/workflows/${workflowId}/runs/load-test`, {
      method: "POST",
      body: input,
    }),
  );
}
