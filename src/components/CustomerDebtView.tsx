"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import {
  Users,
  CreditCard,
  Plus,
  AlertCircle,
  Search,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Receipt,
  RotateCcw,
} from "lucide-react";

export function CustomerDebtView() {
  const { customers, totalOutstandingDebt, debtorsCount, openRecordPayment, openRecordSale } = useStock();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "DEBTORS" | "CLEAR">("ALL");

  const filtered = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search)) ||
      (c.address && c.address.toLowerCase().includes(search.toLowerCase()));

    if (filter === "DEBTORS") return matchesSearch && c.outstandingBalance > 0;
    if (filter === "CLEAR") return matchesSearch && c.outstandingBalance === 0;
    return matchesSearch;
  });

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Customers Who Owe You
            </h2>
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800">
              {debtorsCount} owe money
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Track customer balances, credit taken, and record debt recovery payments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openRecordPayment()}
            className="flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
          >
            <CreditCard className="h-4 w-4" />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* Debt Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-red-200 bg-linear-to-b from-white to-red-50/50 p-4 shadow-xs">
          <div className="text-xs font-bold uppercase tracking-wider text-red-900">
            Total Money Tied Up in Customer Debt
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black text-red-700">
              ₦{totalOutstandingDebt.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-red-800">
            Total pending across {debtorsCount} customer accounts
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-linear-to-b from-white to-emerald-50/50 p-4 shadow-xs">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-900">
            Total Customers Registered
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black text-emerald-900">
              {customers.length}
            </span>
            <span className="text-xs text-slate-600">({debtorsCount} currently owe)</span>
          </div>
          <p className="mt-1 text-[11px] text-emerald-800">
            Customers with recorded business activity
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Trustworthy Ledger Rule
          </div>
          <p className="mt-1 text-xs text-slate-700 leading-relaxed">
            Customer debt is derived automatically from credit sales minus actual payments received. It cannot be manually altered.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search customer name, phone number, or project site..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-h-[46px] rounded-2xl border border-slate-300 bg-white pl-10 pr-4 text-sm font-medium text-slate-900 focus:border-amber-600"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilter("ALL")}
            className={`min-h-[34px] rounded-xl px-3 text-xs font-bold transition-colors ${
              filter === "ALL" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All Customers ({customers.length})
          </button>
          <button
            onClick={() => setFilter("DEBTORS")}
            className={`min-h-[34px] rounded-xl px-3 text-xs font-bold transition-colors ${
              filter === "DEBTORS" ? "bg-red-600 text-white" : "bg-red-50 text-red-700 hover:bg-red-100"
            }`}
          >
            Owing Money ({debtorsCount})
          </button>
          <button
            onClick={() => setFilter("CLEAR")}
            className={`min-h-[34px] rounded-xl px-3 text-xs font-bold transition-colors ${
              filter === "CLEAR" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            }`}
          >
            Settled / Clear ({customers.length - debtorsCount})
          </button>
        </div>
      </div>

      {/* Customers List */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-slate-400 mb-2" />
          <h3 className="text-sm font-bold text-slate-800">
            {filter === "DEBTORS"
              ? "No customers currently owe money! All accounts are settled."
              : "No customer records found."}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Customers are registered automatically when you record sales with customer names or credit.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filtered.map((c) => {
            const owes = c.outstandingBalance > 0;

            return (
              <div
                key={c.id}
                className={`rounded-2xl border p-4 shadow-xs transition-all ${
                  owes ? "border-red-200 bg-white hover:border-red-300" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">{c.name}</h4>
                    {c.phone && <div className="text-xs text-slate-500">{c.phone}</div>}
                    {c.address && <div className="text-[11px] text-slate-500 mt-0.5">{c.address}</div>}
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      owes ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {owes ? "OWES MONEY" : "CLEAR"}
                  </span>
                </div>

                <div className="mt-3 rounded-xl bg-slate-50 p-3 flex items-center justify-between border border-slate-100">
                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase">
                      Money Owed
                    </span>
                    <div className={`text-lg font-black ${owes ? "text-red-700" : "text-emerald-700"}`}>
                      ₦{c.outstandingBalance.toLocaleString()}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase">
                      Total Paid to Date
                    </span>
                    <div className="text-sm font-bold text-slate-800">
                      ₦{c.totalPaid.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center gap-2 pt-2 border-t border-slate-100">
                  {owes && (
                    <button
                      onClick={() => openRecordPayment(c)}
                      className="flex-1 flex min-h-[38px] items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-95"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      <span>Collect Money</span>
                    </button>
                  )}

                  <button
                    onClick={() => openRecordSale()}
                    className="flex min-h-[38px] items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <span>New Sale</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
