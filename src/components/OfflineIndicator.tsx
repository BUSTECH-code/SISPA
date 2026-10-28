"use client";

import React from "react";
import { useStock } from "@/context/StockContext";
import { WifiOff, RefreshCw } from "lucide-react";

export function OfflineIndicator() {
  const { isOnline, offlineQueue, openOfflineQueue, isSyncingQueue } = useStock();

  const pendingCount = offlineQueue.filter(
    (m) => m.status === "PENDING" || m.status === "FAILED" || m.status === "SYNCING"
  ).length;

  const rejectedCount = offlineQueue.filter((m) => m.status === "REJECTED").length;

  // If online and nothing is pending or rejected, render nothing
  if (isOnline && pendingCount === 0 && rejectedCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-40 max-w-sm">
      <div
        onClick={openOfflineQueue}
        className={`cursor-pointer flex items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-xl border backdrop-blur-md transition-all active:scale-98 ${
          !isOnline
            ? "bg-slate-900/95 text-white border-slate-700"
            : rejectedCount > 0
            ? "bg-red-600 text-white border-red-500"
            : "bg-amber-600 text-white border-amber-500"
        }`}
      >
        <div className="flex items-center gap-2.5">
          {!isOnline ? (
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-red-500/20 text-red-400">
              <WifiOff className="h-4 w-4" />
            </div>
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/20 text-white">
              <RefreshCw className={`h-4 w-4 ${isSyncingQueue ? "animate-spin" : ""}`} />
            </div>
          )}

          <div>
            <p className="text-xs font-bold leading-tight">
              {!isOnline
                ? "Working Offline"
                : rejectedCount > 0
                ? `${rejectedCount} transaction rejected`
                : isSyncingQueue
                ? "Syncing transactions..."
                : `${pendingCount} transaction pending`}
            </p>
            <p className="text-[10px] opacity-80">
              {!isOnline
                ? `${pendingCount} queued. Tap to view outbox`
                : "Tap to review offline outbox"}
            </p>
          </div>
        </div>

        <button className="rounded-xl bg-white/20 px-2.5 py-1 text-[11px] font-bold hover:bg-white/30 transition-colors">
          View Outbox
        </button>
      </div>
    </div>
  );
}
