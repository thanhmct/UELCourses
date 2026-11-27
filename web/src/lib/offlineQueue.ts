const QUEUE_KEY = "uelcourses-offline-queue-v1";
const LEGACY_QUEUE_KEY = "uelcourses-feedback-queue";
const MAX_QUEUE_SIZE = 100;

interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body?: string;
  credentials?: RequestCredentials;
  expectedUserId?: number;
  queuedAt: string;
}

function readQueue(): QueuedRequest[] {
  try {
    const stored = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((item): item is QueuedRequest =>
      item && typeof item.id === "string" && typeof item.url === "string" && typeof item.method === "string",
    );
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedRequest[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event("uel:offline-queue-updated"));
}

export function enqueueRequest(url: string, init: RequestInit = {}, expectedUserId?: number): void {
  const queue = readQueue();
  if (queue.length >= MAX_QUEUE_SIZE) {
    throw new Error("Offline submission queue is full");
  }
  const item: QueuedRequest = {
    id: crypto.randomUUID(),
    url,
    method: init.method ?? "POST",
    ...(typeof init.body === "string" ? { body: init.body } : {}),
    ...(init.credentials ? { credentials: init.credentials } : {}),
    ...(expectedUserId !== undefined ? { expectedUserId } : {}),
    queuedAt: new Date().toISOString(),
  };
  writeQueue([...queue, item]);
}

let flushing = false;

export async function flushOfflineQueue(apiBaseUrl: string): Promise<void> {
  if (flushing || typeof window === "undefined" || !navigator.onLine) return;
  flushing = true;
  try {
    for (const item of readQueue()) {
      if (!readQueue().some((queued) => queued.id === item.id)) continue;
      if (item.expectedUserId !== undefined) {
        try {
          const response = await fetch(`${apiBaseUrl}/api/auth/me`, { credentials: "include" });
          if (!response.ok) continue;
          const me = await response.json() as { user?: { id?: number } | null };
          if (me.user?.id !== item.expectedUserId) continue;
        } catch {
          break;
        }
      }
      try {
        const response = await fetch(item.url, {
          method: item.method,
          credentials: item.credentials ?? "same-origin",
          headers: item.body ? { "Content-Type": "application/json" } : undefined,
          body: item.body,
        });
        if (response.status === 401 || response.status === 403 || response.status === 429) continue;
        if (response.status >= 500) break;
        if (!response.ok && response.status !== 409) {
          window.dispatchEvent(new CustomEvent("uel:offline-queue-failed", {
            detail: { url: item.url, status: response.status },
          }));
        }
        const queue = readQueue();
        const remaining = queue.filter((queued) => queued.id !== item.id);
        if (remaining.length !== queue.length) {
          writeQueue(remaining);
        }
        if (!response.ok && response.status !== 409) {
          continue;
        }
      } catch {
        break;
      }
    }

    // Older versions saved feedback payloads without a request URL.
    while (true) {
      let legacy: unknown[];
      try {
        const stored = JSON.parse(localStorage.getItem(LEGACY_QUEUE_KEY) ?? "[]");
        legacy = Array.isArray(stored) ? stored : [];
      } catch {
        break;
      }
      const index = legacy.findIndex((item) =>
        item && typeof item === "object" && !("url" in item) && "message" in item,
      );
      if (index < 0) break;
      const payload = { ...(legacy[index] as Record<string, unknown>) };
      delete payload.queued_at;
      try {
        const response = await fetch(`${apiBaseUrl}/api/feedback`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (response.status >= 500 || response.status === 429) break;
        if (!response.ok && response.status !== 409) {
          window.dispatchEvent(new CustomEvent("uel:offline-queue-failed", {
            detail: { url: `${apiBaseUrl}/api/feedback`, status: response.status },
          }));
        }
        legacy.splice(index, 1);
        localStorage.setItem(LEGACY_QUEUE_KEY, JSON.stringify(legacy));
        window.dispatchEvent(new Event("uel:offline-queue-updated"));
      } catch {
        break;
      }
    }
  } finally {
    flushing = false;
  }
}
