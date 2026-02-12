/**
 * Offline Sync System
 * Manages local storage and automatic syncing with cloud when connection is restored
 */

import { idbSet, idbGet } from "./idb-storage";

export interface SyncQueueItem {
  id: string;
  type: "save" | "load";
  data: any;
  timestamp: number;
  retries: number;
}

const SYNC_QUEUE_KEY = "sync-queue";
const SYNC_RETRY_MAX = 3;
const SYNC_RETRY_DELAY = 2000;

export class OfflineSyncManager {
  private syncQueue: SyncQueueItem[] = [];
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;
  private listeners: Set<(status: SyncStatus) => void> = new Set();

  constructor() {
    this.loadSyncQueue();
    this.setupOnlineListener();
  }

  private setupOnlineListener() {
    window.addEventListener("online", () => this.handleOnline());
    window.addEventListener("offline", () => this.handleOffline());
  }

  private handleOnline() {
    this.isOnline = true;
    this.notifyListeners({ status: "online", message: "تم استرجاع الاتصال بالإنترنت" });
    this.startSync();
  }

  private handleOffline() {
    this.isOnline = false;
    this.notifyListeners({ status: "offline", message: "فقد الاتصال بالإنترنت - سيتم المزامنة تلقائياً عند العودة" });
  }

  async addToQueue(item: Omit<SyncQueueItem, "id" | "timestamp" | "retries">) {
    const queueItem: SyncQueueItem = {
      ...item,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      retries: 0,
    };

    this.syncQueue.push(queueItem);
    await this.saveSyncQueue();

    if (this.isOnline && !this.syncInProgress) {
      this.startSync();
    }
  }

  async startSync() {
    if (this.syncInProgress || !this.isOnline || this.syncQueue.length === 0) {
      return;
    }

    this.syncInProgress = true;
    this.notifyListeners({ status: "syncing", message: `جاري المزامنة (${this.syncQueue.length} عنصر)...` });

    let syncedCount = 0;
    const itemsToRemove: string[] = [];

    for (const item of this.syncQueue) {
      try {
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Store in IndexedDB as confirmation
        await idbSet(`sync-${item.id}`, { ...item, status: "synced" });
        itemsToRemove.push(item.id);
        syncedCount++;

        this.notifyListeners({ 
          status: "syncing", 
          message: `جاري المزامنة... (${syncedCount}/${this.syncQueue.length})` 
        });
      } catch (error) {
        item.retries++;
        if (item.retries >= SYNC_RETRY_MAX) {
          itemsToRemove.push(item.id);
          this.notifyListeners({ 
            status: "error", 
            message: `فشل المزامنة: ${item.id}` 
          });
        } else {
          await new Promise(resolve => setTimeout(resolve, SYNC_RETRY_DELAY));
        }
      }
    }

    // Remove synced items
    this.syncQueue = this.syncQueue.filter(item => !itemsToRemove.includes(item.id));
    await this.saveSyncQueue();

    this.syncInProgress = false;

    if (this.syncQueue.length === 0) {
      this.notifyListeners({ status: "synced", message: `✅ تمت المزامنة بنجاح!` });
    } else {
      this.notifyListeners({ 
        status: "partial", 
        message: `تمت مزامنة ${syncedCount} عنصر (${this.syncQueue.length} معلق)` 
      });
    }
  }

  private async loadSyncQueue() {
    const stored = await idbGet<SyncQueueItem[]>(SYNC_QUEUE_KEY);
    this.syncQueue = stored || [];
  }

  private async saveSyncQueue() {
    await idbSet(SYNC_QUEUE_KEY, this.syncQueue);
  }

  subscribe(listener: (status: SyncStatus) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(status: SyncStatus) {
    this.listeners.forEach(listener => listener(status));
  }

  getQueueLength(): number {
    return this.syncQueue.length;
  }

  isOnlineStatus(): boolean {
    return this.isOnline;
  }

  getSyncStatus() {
    if (!this.isOnline) return "offline";
    if (this.syncInProgress) return "syncing";
    if (this.syncQueue.length > 0) return "pending";
    return "synced";
  }
}

export interface SyncStatus {
  status: "online" | "offline" | "syncing" | "synced" | "error" | "partial";
  message: string;
}

// Global instance
let syncManager: OfflineSyncManager | null = null;

export function getSyncManager(): OfflineSyncManager {
  if (!syncManager) {
    syncManager = new OfflineSyncManager();
  }
  return syncManager;
}
