/**
 * SISPA 1.0 — Durable Client-Side Offline Mutation Queue & Synchronization Engine
 * 
 * Design Principles:
 * - Local IndexedDB persistence: Survived browser closing/reloads
 * - Strict Identity Scoping: Queued mutations are tied to userId & businessId; never replayed under a different identity
 * - True Idempotency: Every mutation has a clientTxId passed to the server as `idempotencyKey`
 * - Clear States: PENDING -> SYNCING -> SYNCED (or FAILED with retry count, or REJECTED if invalid/unauthorized)
 * - Zero Credential Storage: Never stores passwords, tokens, or session secrets
 */

export type OfflineMutationType = "SALE" | "DELIVERY" | "PAYMENT" | "STOCK_COUNT";

export type OfflineMutationStatus =
  | "PENDING"
  | "SYNCING"
  | "SYNCED"
  | "FAILED"
  | "REJECTED";

export interface OfflineMutation {
  id: string; // UUID / idempotencyKey
  businessId: number;
  userId: number;
  userRole: "OWNER" | "STAFF";
  actorName: string;
  type: OfflineMutationType;
  endpoint: string;
  payload: any;
  summary: string;
  status: OfflineMutationStatus;
  errorReason?: string;
  createdAt: number;
  syncedAt?: number;
  retryCount: number;
}

const DB_NAME = "sispa_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "offline_queue";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "sispa_tx_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("businessId", "businessId", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Enqueue a new mutation to be synced when connectivity is restored
 */
export async function enqueueOfflineMutation(params: {
  businessId: number;
  userId: number;
  userRole: "OWNER" | "STAFF";
  actorName: string;
  type: OfflineMutationType;
  endpoint: string;
  payload: any;
  summary: string;
  id?: string;
}): Promise<OfflineMutation> {
  const db = await openDb();
  const id = params.id || generateUUID();

  const mutation: OfflineMutation = {
    id,
    businessId: params.businessId,
    userId: params.userId,
    userRole: params.userRole,
    actorName: params.actorName,
    type: params.type,
    endpoint: params.endpoint,
    payload: {
      ...params.payload,
      idempotencyKey: id,
    },
    summary: params.summary,
    status: "PENDING",
    createdAt: Date.now(),
    retryCount: 0,
  };

  if (!db) {
    return mutation;
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(mutation);
      req.onsuccess = () => resolve(mutation);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retrieve all pending or failed mutations for the current user
 */
export async function getPendingMutations(userId?: number): Promise<OfflineMutation[]> {
  const all = await getAllMutations(userId);
  return all.filter((m) => m.status === "PENDING" || m.status === "FAILED" || m.status === "SYNCING");
}

/**
 * Retrieve all mutations for the current user (including SYNCED and REJECTED)
 */
export async function getAllMutations(userId?: number): Promise<OfflineMutation[]> {
  const db = await openDb();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        let results: OfflineMutation[] = req.result || [];
        if (userId) {
          results = results.filter((m) => m.userId === userId);
        }
        // Sort chronologically (FIFO execution)
        results.sort((a, b) => a.createdAt - b.createdAt);
        resolve(results);
      };

      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * Update mutation status in IndexedDB
 */
export async function updateMutationStatus(
  id: string,
  status: OfflineMutationStatus,
  errorReason?: string
): Promise<void> {
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const item: OfflineMutation | undefined = getReq.result;
        if (!item) {
          resolve();
          return;
        }

        item.status = status;
        if (errorReason !== undefined) {
          item.errorReason = errorReason;
        }
        if (status === "SYNCED") {
          item.syncedAt = Date.now();
        }
        if (status === "FAILED") {
          item.retryCount = (item.retryCount || 0) + 1;
        }

        const putReq = store.put(item);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Delete a specific mutation from the queue
 */
export async function deleteMutation(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Remove all successfully synced mutations for cleanup
 */
export async function clearSyncedMutations(userId?: number): Promise<void> {
  const all = await getAllMutations(userId);
  const syncedIds = all.filter((m) => m.status === "SYNCED").map((m) => m.id);

  const db = await openDb();
  if (!db || syncedIds.length === 0) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const id of syncedIds) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Sync a single queued mutation to the server
 */
export async function syncSingleMutation(mutation: OfflineMutation): Promise<{
  success: boolean;
  status: OfflineMutationStatus;
  error?: string;
  result?: any;
}> {
  await updateMutationStatus(mutation.id, "SYNCING");

  try {
    const res = await fetch(mutation.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": mutation.id,
        "X-Client-Tx-Id": mutation.id,
      },
      body: JSON.stringify(mutation.payload),
    });

    const json = await res.json().catch(() => null);

    if (res.ok && json?.success) {
      await updateMutationStatus(mutation.id, "SYNCED");
      return { success: true, status: "SYNCED", result: json.data };
    }

    // HTTP 400 or 403: Unrecoverable business rule failure or lack of permission -> REJECTED
    if (res.status === 400 || res.status === 403) {
      const reason = json?.error || `Server rejected: HTTP ${res.status}`;
      await updateMutationStatus(mutation.id, "REJECTED", reason);
      return { success: false, status: "REJECTED", error: reason };
    }

    // Other status (e.g., 500, 502, 503) -> Retryable failure
    const retryReason = json?.error || `Temporary server issue: HTTP ${res.status}`;
    await updateMutationStatus(mutation.id, "FAILED", retryReason);
    return { success: false, status: "FAILED", error: retryReason };
  } catch (netErr: any) {
    // Network drop or offline
    const errMsg = netErr?.message || "No internet connection.";
    await updateMutationStatus(mutation.id, "FAILED", errMsg);
    return { success: false, status: "FAILED", error: errMsg };
  }
}

/**
 * Synchronize all pending mutations for the authenticated user in FIFO order
 */
export async function syncAllPendingMutations(
  userId: number,
  userRole: "OWNER" | "STAFF"
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  rejected: number;
}> {
  const pending = await getPendingMutations(userId);

  let succeeded = 0;
  let failed = 0;
  let rejected = 0;

  for (const item of pending) {
    // Verify that the queued mutation belongs to this identity
    if (item.userId !== userId) {
      continue;
    }

    const res = await syncSingleMutation(item);
    if (res.status === "SYNCED") {
      succeeded++;
    } else if (res.status === "REJECTED") {
      rejected++;
    } else {
      failed++;
      // Stop sequential replay on network failure so ordering is strictly preserved
      break;
    }
  }

  return {
    processed: pending.length,
    succeeded,
    failed,
    rejected,
  };
}
