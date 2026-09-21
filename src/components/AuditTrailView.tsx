"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import {
  History,
  TrendingDown,
  Truck,
  CreditCard,
  Scale,
  Receipt,
  Tag,
  Calculator,
  Search,
  Filter,
  ShieldCheck,
  Smartphone,
  Globe,
  RefreshCw,
} from "lucide-react";

export function AuditTrailView() {
  const { auditLogs, isOwner, isLoading, refreshData, openCashCheck, exportBusinessBackup } = useStock();
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const filtered = auditLogs.filter((log) => {
    const matchesFilter = filter === "ALL" || log.eventType === filter;
    const matchesSearch =
      log.description.toLowerCase().includes(search.toLowerCase()) ||
      log.actorName.toLowerCase().includes(search.toLowerCase()) ||
      (log.reason && log.reason.toLowerCase().includes(search.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Business Activity & Audit Trail
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
              {auditLogs.length} events
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Trustworthy history of who performed each action, what changed, and when it happened.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isOwner && (
            <>
              <button
                onClick={openCashCheck}
                className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 text-xs font-bold text-purple-900 hover:bg-purple-100 transition-colors"
              >
                <Calculator className="h-3.5 w-3.5 text-purple-700" />
                <span>End-of-Day Cash Check</span>
              </button>

              <button
                onClick={exportBusinessBackup}
                className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span>Export Backup (JSON)</span>
              </button>
            </>
          )}

          <button
            onClick={() => refreshData()}
            disabled={isLoading}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-amber-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Audit Invariant Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Immutable History Invariant
          </span>
          <p className="mt-1 text-xs text-slate-700 leading-relaxed">
            Historical events cannot be silently rewritten or erased. If an error occurred, corrections are appended as new audit events.
          </p>
        </div>

        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-purple-900">
            Multi-User Attribution
          </span>
          <p className="mt-1 text-xs text-purple-900 leading-relaxed">
            Every sale, payment, shipment arrival, and stock count records the exact staff or owner operator responsible.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-900">
            Commercial Sensitivity
          </span>
          <p className="mt-1 text-xs text-emerald-900 leading-relaxed">
            Sensitive commercial facts (purchase prices, margins) are strictly hidden from staff accounts server-side.
          </p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by person, product, or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-h-[46px] rounded-2xl border border-slate-300 bg-white pl-10 pr-4 text-sm font-medium text-slate-900 focus:border-amber-600"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { label: "All Events", val: "ALL" },
            { label: "Sales", val: "SALE" },
            { label: "Deliveries", val: "DELIVERY" },
            { label: "Debt Payments", val: "PAYMENT" },
            { label: "Expenses", val: "EXPENSE" },
            { label: "Stock Counts", val: "STOCK_COUNT" },
            { label: "Corrections", val: "TRANSACTION_CORRECTION" },
            { label: "Price Changes", val: "PRICE_CHANGE" },
            { label: "Cash Checks", val: "DAILY_CASH_CHECK" },
          ].map((item) => (
            <button
              key={item.val}
              onClick={() => setFilter(item.val)}
              className={`rounded-xl px-3 py-1.5 font-bold transition-colors whitespace-nowrap ${
                filter === item.val
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Log Timeline */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center">
          <History className="mx-auto h-8 w-8 text-slate-400 mb-2" />
          <h3 className="text-sm font-bold text-slate-800">No audit events match your filter</h3>
          <p className="mt-1 text-xs text-slate-500">
            Actions recorded in the shop or through WhatsApp will appear here with full attribution.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-3xl bg-white overflow-hidden shadow-xs">
          {filtered.map((log) => {
            const formattedDate = new Date(log.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div key={log.id} className="p-4 flex items-start justify-between gap-3 hover:bg-slate-50">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl mt-0.5 ${
                      log.eventType === "SALE"
                        ? "bg-red-100 text-red-700"
                        : log.eventType === "DELIVERY"
                        ? "bg-emerald-100 text-emerald-700"
                        : log.eventType === "PAYMENT"
                        ? "bg-blue-100 text-blue-700"
                        : log.eventType === "EXPENSE"
                        ? "bg-orange-100 text-orange-800"
                        : log.eventType === "STOCK_COUNT"
                        ? "bg-amber-100 text-amber-800"
                        : log.eventType === "PRICE_CHANGE"
                        ? "bg-teal-100 text-teal-800"
                        : "bg-purple-100 text-purple-800"
                    }`}
                  >
                    {log.eventType === "SALE" && <TrendingDown className="h-5 w-5 stroke-[2.2]" />}
                    {log.eventType === "DELIVERY" && <Truck className="h-5 w-5 stroke-[2.2]" />}
                    {log.eventType === "PAYMENT" && <CreditCard className="h-5 w-5 stroke-[2.2]" />}
                    {log.eventType === "EXPENSE" && <Receipt className="h-5 w-5 stroke-[2.2]" />}
                    {log.eventType === "STOCK_COUNT" && <Scale className="h-5 w-5 stroke-[2.2]" />}
                    {log.eventType === "PRICE_CHANGE" && <Tag className="h-5 w-5 stroke-[2.2]" />}
                    {log.eventType === "DAILY_CASH_CHECK" && <Calculator className="h-5 w-5 stroke-[2.2]" />}
                    {log.eventType !== "SALE" &&
                      log.eventType !== "DELIVERY" &&
                      log.eventType !== "PAYMENT" &&
                      log.eventType !== "EXPENSE" &&
                      log.eventType !== "STOCK_COUNT" &&
                      log.eventType !== "PRICE_CHANGE" &&
                      log.eventType !== "DAILY_CASH_CHECK" && <History className="h-5 w-5 stroke-[2.2]" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{log.description}</span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {log.eventType.replace(/_/g, " ")}
                      </span>
                      {log.isSensitive && (
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                          Owner Sensitive
                        </span>
                      )}
                    </div>

                    {log.reason && (
                      <p className="mt-1 text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <strong>Reason:</strong> {log.reason}
                      </p>
                    )}

                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                      <span className="font-semibold text-slate-600">By {log.actorName} ({log.actorRole})</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        {log.source === "WHATSAPP" ? <Smartphone className="h-3 w-3 text-emerald-600" /> : <Globe className="h-3 w-3 text-slate-400" />}
                        {log.source}
                      </span>
                      <span>•</span>
                      <span>{formattedDate}</span>
                    </div>
                  </div>
                </div>

                {log.newValue && (
                  <div className="text-right shrink-0">
                    <span className="text-xs font-black text-slate-800 bg-slate-100 px-2 py-1 rounded-lg">
                      {log.newValue}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
