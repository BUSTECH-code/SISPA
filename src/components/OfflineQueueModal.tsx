"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import {
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Trash2,
  X,
  TrendingDown,
  ArrowDownLeft,
  CreditCard,
  CheckSquare,
} from "lucide-react";

export function OfflineQueueModal() {
  const {
    isOfflineQueueOpen,
    closeOfflineQueue,
    offlineQueue,
    isOnline,
    isSyncingQueue,
    syncQueueNow,
    retrySingleOfflineMutation,
    discardOfflineMutation,
    clearSyncedQueueItems,
  } = useStock();

  const [activeFilter, setActiveFilter] = useState<"ALL" | "PENDING" | "REJECTED" | "SYNCED">("ALL");

  if (!isOfflineQueueOpen) return null;

  const pendingItems = offlineQueue.filter((m) => m.status === "PENDING" || m.status === "FAILED" || m.status === "SYNCING");
  const rejectedItems = offlineQueue.filter((m) => m.status === "REJECTED");
  const syncedItems = offlineQueue.filter((m) => m.status === "SYNCED");

  const filteredItems = offlineQueue.filter((m) => {
    if (activeFilter === "PENDING") return m.status === "PENDING" || m.status === "FAILED" || m.status === "SYNCING";
    if (activeFilter === "REJECTED") return m.status === "REJECTED";
    if (activeFilter === "SYNCED") return m.status === "SYNCED";
    return true;
  });

  const getItemIcon = (type: string) => {
    switch (type) {
      case "SALE":
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      case "DELIVERY":
        return <ArrowDownLeft className="h-4 w-4 text-slate-800" />;
      case "PAYMENT":
        return <CreditCard className="h-4 w-4 text-emerald-600" />;
      case "STOCK_COUNT":
        return <CheckSquare className="h-4 w-4 text-purple-600" />;
      default:
        return <Clock className="h-4 w-4 text-slate-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SYNCED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
            <CheckCircle2 className="h-3 w-3" /> Synced
          </span>
        );
      case "SYNCING":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 animate-pulse">
            <RefreshCw className="h-3 w-3 animate-spin" /> Syncing...
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
            <AlertTriangle className="h-3 w-3 text-amber-700" /> Pending Retry
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
            <XCircle className="h-3 w-3" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
            <Clock className="h-3 w-3" /> Queued
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isOnline ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
              {isOnline ? <RefreshCw className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">Offline Outbox</h3>
                <span className={`rounded-full px-2 py-0.2 text-[10px] font-black ${isOnline ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                  {isOnline ? "Online" : "Offline"}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {pendingItems.length} transactions waiting to sync
              </p>
            </div>
          </div>
          <button
            onClick={closeOfflineQueue}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sync Controls & Filter Bar */}
        <div className="bg-slate-50 border-b border-slate-100 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => syncQueueNow()}
              disabled={isSyncingQueue || !isOnline || pendingItems.length === 0}
              className="flex-1 flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-amber-700 disabled:opacity-40 transition-all active:scale-98"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncingQueue ? "animate-spin" : ""}`} />
              <span>{isSyncingQueue ? "Syncing Now..." : `Sync Pending (${pendingItems.length})`}</span>
            </button>

            {syncedItems.length > 0 && (
              <button
                onClick={() => clearSyncedQueueItems()}
                className="flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all"
                title="Clear already-synced history"
              >
                <Trash2 className="h-3.5 w-3.5 text-slate-500" />
                <span>Clear Done</span>
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex gap-1 overflow-x-auto text-xs font-bold pt-1">
            <button
              onClick={() => setActiveFilter("ALL")}
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                activeFilter === "ALL" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-200"
              }`}
            >
              All ({offlineQueue.length})
            </button>
            <button
              onClick={() => setActiveFilter("PENDING")}
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                activeFilter === "PENDING" ? "bg-amber-600 text-white" : "bg-white text-slate-600 hover:bg-slate-200"
              }`}
            >
              Pending ({pendingItems.length})
            </button>
            {rejectedItems.length > 0 && (
              <button
                onClick={() => setActiveFilter("REJECTED")}
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  activeFilter === "REJECTED" ? "bg-red-600 text-white" : "bg-white text-slate-600 hover:bg-slate-200"
                }`}
              >
                Rejected ({rejectedItems.length})
              </button>
            )}
            <button
              onClick={() => setActiveFilter("SYNCED")}
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                activeFilter === "SYNCED" ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-200"
              }`}
            >
              Synced ({syncedItems.length})
            </button>
          </div>
        </div>

        {/* Mutation Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500/80 mb-2" />
              <p className="text-sm font-bold text-slate-700">Outbox is clear</p>
              <p className="text-xs text-slate-500 mt-0.5">
                All transactions recorded on this device have been saved to the server.
              </p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
                      {getItemIcon(item.type)}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 leading-tight">
                        {item.summary}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} • By {item.actorName}
                      </p>
                    </div>
                  </div>
                  <div>{getStatusBadge(item.status)}</div>
                </div>

                {/* Error / Rejected reason */}
                {item.errorReason && (
                  <div className={`rounded-xl p-2 text-[11px] leading-relaxed ${
                    item.status === "REJECTED" ? "bg-red-50 text-red-900 border border-red-200" : "bg-amber-50 text-amber-900 border border-amber-200"
                  }`}>
                    <strong>Note:</strong> {item.errorReason}
                  </div>
                )}

                {/* Action buttons for items */}
                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <span className="text-[10px] font-mono text-slate-400 truncate max-w-[150px]">
                    ID: {item.id.slice(0, 16)}...
                  </span>

                  <div className="flex items-center gap-2">
                    {(item.status === "FAILED" || item.status === "PENDING") && isOnline && (
                      <button
                        onClick={() => retrySingleOfflineMutation(item)}
                        disabled={isSyncingQueue}
                        className="font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Retry</span>
                      </button>
                    )}
                    {(item.status === "REJECTED" || item.status === "FAILED") && (
                      <button
                        onClick={() => discardOfflineMutation(item.id)}
                        className="font-bold text-red-700 hover:text-red-900 flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Discard</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="border-t border-slate-100 bg-slate-50 p-3 text-center text-[11px] text-slate-500">
          Queue stored securely in browser IndexedDB. Transactions sync automatically when connection recovers.
        </div>
      </div>
    </div>
  );
}
