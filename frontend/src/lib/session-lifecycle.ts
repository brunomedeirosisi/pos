let generation = 0;
const requests = new Set<AbortController>();

export class SessionChangedError extends Error {
  constructor() { super('Session changed; request discarded'); this.name = 'SessionChangedError'; }
}

export function currentSessionGeneration(): number { return generation; }

export function advanceSessionGeneration(): number {
  generation += 1;
  for (const request of requests) request.abort();
  requests.clear();
  return generation;
}

export function assertSessionGeneration(expected: number): void {
  if (expected !== generation) throw new SessionChangedError();
}

export function trackSessionRequest(controller: AbortController): () => void {
  requests.add(controller);
  return () => requests.delete(controller);
}
