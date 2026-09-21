"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import {
  Receipt,
  Plus,
  Search,
  Calendar,
  Wallet,
  ArrowUpRight,
  TrendingDown,
} from "lucide-react";

export function ExpensesView() {
  const { expenses, totalExpenses, openRecordExpense } = useStock();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");

  const categories = ["ALL", "Shop Operations", "Transport & Logistics", "Repairs & Maintenance", "Utilities & Fuel", "Staff Welfare", "Other"];

  const filtered = expenses.filter((e) => {
    const matchesSearch =
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      (e.notes && e.notes.toLowerCase().includes(search.toLowerCase()));

    const matchesCat = selectedCategory === "ALL" || e.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Shop Expenses
            </h2>
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-800">
              {expenses.length} records
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Track money spent on fuel, transport, shop repairs, and offloading.
          </p>
        </div>

        <button
          onClick={openRecordExpense}
          className="flex min-h-[42px] items-center gap-1.5 rounded-xl bg-orange-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-orange-700 active:scale-95 transition-all self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Record Expense</span>
        </button>
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-orange-200 bg-linear-to-b from-white to-orange-50/50 p-4 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-orange-900">
            Total Money Spent on Expenses
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black text-orange-700">
              ₦{totalExpenses.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-orange-800">
            Operating costs separate from stock purchase costs
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Expense Invariant
          </span>
          <p className="mt-1 text-xs text-slate-700 leading-relaxed">
            Expenses directly reduce your business net profit in weekly briefings and period reports.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Traceable Money Out
          </span>
          <p className="mt-1 text-xs text-slate-700 leading-relaxed">
            Every recorded expense is timestamped and categorized for easy review during month-end audits.
          </p>
        </div>
      </div>

      {/* Search and Category filter */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search expenses (e.g. diesel, offloading, repairs)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-h-[46px] rounded-2xl border border-slate-300 bg-white pl-10 pr-4 text-sm font-medium text-slate-900 focus:border-amber-600"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-xl px-3 py-1.5 font-bold transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {cat === "ALL" ? "All Categories" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <Receipt className="mx-auto h-8 w-8 text-slate-400 mb-2" />
          <h3 className="text-sm font-bold text-slate-800">
            {expenses.length === 0
              ? "No expenses recorded this week."
              : "No expenses match your search."}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {expenses.length === 0
              ? "Keep track of generator diesel, transport, and offloading labor by recording shop expenses."
              : "Try searching with a different keyword or reset the category filter."}
          </p>
          <button
            onClick={() => {
              if (expenses.length === 0) {
                openRecordExpense();
              } else {
                setSearch("");
                setSelectedCategory("ALL");
              }
            }}
            className="mt-3 text-xs font-bold text-orange-700 hover:underline"
          >
            {expenses.length === 0 ? "Record First Expense" : "Reset filters"}
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-3xl bg-white overflow-hidden shadow-xs">
          {filtered.map((item) => {
            const formattedDate = new Date(item.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div key={item.id} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-800 mt-0.5">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{item.title}</span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {item.category}
                      </span>
                    </div>
                    {item.notes && <p className="mt-0.5 text-xs text-slate-600">{item.notes}</p>}
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                      <span>Paid via {item.paymentMethod}</span>
                      <span>•</span>
                      <span>{formattedDate}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-base font-black text-orange-700">
                    -₦{Number(item.amount).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
