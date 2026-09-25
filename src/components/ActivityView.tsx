"use client";

import React from "react";
import { useStock, type ActivityItem } from "@/context/StockContext";
import {
  TrendingDown,
  Truck,
  Scale,
  Calendar,
  History,
  Store,
  RefreshCw,
  DollarSign,
  RotateCcw,
} from "lucide-react";

export function ActivityView() {
  const {
    activities,
    isLoading,
    refreshData,
    isOwner,
    openUpdateCost,
    openSaleCorrection,
  } = useStock();

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Activity History
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
              {activities.length} recent events
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            What happened in your shop: sales, deliveries received, physical stock counts, and adjustments.
          </p>
        </div>

        <button
          onClick={() => refreshData()}
          disabled={isLoading}
          className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-amber-600" : ""}`} />
        </button>
      </div>

      {/* Activity Timeline */}
      {activities.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <History className="mx-auto h-8 w-8 text-slate-400 mb-2" />
          <h3 className="text-sm font-bold text-slate-800">No activity recorded yet</h3>
          <p className="text-xs text-slate-500 mt-1">
            When you record sales, deliveries, or physical stock counts, they will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((item) => {
            const delta = Number(item.quantityDelta);
            const isPositive = delta > 0;
            const formattedDate = new Date(item.createdAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      item.entryType === "SALE"
                        ? "bg-red-100 text-red-700"
                        : item.entryType === "RESTOCK"
                        ? "bg-emerald-100 text-emerald-700"
                        : item.entryType === "ADJUSTMENT"
                        ? "bg-amber-100 text-amber-800"
                        : item.entryType === "CORRECTION"
                        ? "bg-purple-100 text-purple-800"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {item.entryType === "SALE" && <TrendingDown className="h-5 w-5 stroke-[2.2]" />}
                    {item.entryType === "RESTOCK" && <Truck className="h-5 w-5 stroke-[2.2]" />}
                    {item.entryType === "ADJUSTMENT" && <Scale className="h-5 w-5 stroke-[2.2]" />}
                    {item.entryType === "CORRECTION" && <RotateCcw className="h-5 w-5 stroke-[2.2]" />}
                    {item.entryType === "OPENING_BALANCE" && <Store className="h-5 w-5 stroke-[2.2]" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">
                        {item.productName}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {item.entryType === "SALE" && "Sale"}
                        {item.entryType === "RESTOCK" && "Delivery Received"}
                        {item.entryType === "ADJUSTMENT" && "Stock Count Adjustment"}
                        {item.entryType === "CORRECTION" && "Sale Correction"}
                        {item.entryType === "OPENING_BALANCE" && "Opening Balance"}
                      </span>
                      {item.staffName && (
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          By {item.staffName}
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 text-xs text-slate-600">
                      {item.notes || "Stock updated"}
                    </p>

                    {item.supplierName && (
                      <div className="mt-1 text-[11px] text-slate-500">
                        Supplier: <strong className="text-slate-700">{item.supplierName}</strong>
                        {isOwner && item.unitCost && (
                          <span className="ml-1">
                            @ <strong>₦{Number(item.unitCost).toLocaleString()}</strong> each
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="text-left sm:text-right">
                    <div
                      className={`text-base font-black ${
                        isPositive
                          ? "text-emerald-700"
                          : delta < 0
                          ? "text-red-700"
                          : "text-slate-700"
                      }`}
                    >
                      {isPositive ? `+${delta}` : delta} {item.productUnit}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{formattedDate}</div>
                  </div>

                  {/* Actions: Owner cost entry on deliveries OR sale correction on sales */}
                  {isOwner && item.entryType === "RESTOCK" && !item.unitCost && (
                    <button
                      onClick={() => openUpdateCost(item)}
                      className="rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100"
                    >
                      + Add Cost
                    </button>
                  )}

                  {item.entryType === "SALE" && (
                    <button
                      onClick={openSaleCorrection}
                      title="Correct this sale transaction"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Correct
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
