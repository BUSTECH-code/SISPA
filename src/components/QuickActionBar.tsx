"use client";

import React from "react";
import { useStock } from "@/context/StockContext";
import {
  TrendingDown,
  Truck,
  Scale,
  CreditCard,
  CheckSquare,
  Receipt,
} from "lucide-react";

export function QuickActionBar() {
  const {
    openRecordSale,
    openRecordDelivery,
    openCountStock,
    openRecordPayment,
    openRecordExpense,
    openStockCheck,
  } = useStock();

  return (
    <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-6 sm:gap-2.5">
      {/* 1. Record Sale (SELL) */}
      <button
        onClick={() => openRecordSale()}
        className="group flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-red-200/80 bg-linear-to-b from-white to-red-50/50 p-2.5 text-left shadow-xs transition-all hover:border-red-300 hover:shadow-md active:scale-98"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700 group-hover:bg-red-600 group-hover:text-white transition-colors">
          <TrendingDown className="h-5 w-5 stroke-[2.2]" />
        </div>
        <div className="min-w-0">
          <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">Sell</div>
          <div className="text-[10px] text-slate-500 truncate">Record sale</div>
        </div>
      </button>

      {/* 2. Receive Goods (RECEIVE) */}
      <button
        onClick={() => openRecordDelivery()}
        className="group flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-emerald-200/80 bg-linear-to-b from-white to-emerald-50/50 p-2.5 text-left shadow-xs transition-all hover:border-emerald-300 hover:shadow-md active:scale-98"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
          <Truck className="h-5 w-5 stroke-[2.2]" />
        </div>
        <div className="min-w-0">
          <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">Receive</div>
          <div className="text-[10px] text-slate-500 truncate">Goods arrived</div>
        </div>
      </button>

      {/* 3. Collect Money (COLLECT) */}
      <button
        onClick={() => openRecordPayment()}
        className="group flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-blue-200/80 bg-linear-to-b from-white to-blue-50/50 p-2.5 text-left shadow-xs transition-all hover:border-blue-300 hover:shadow-md active:scale-98"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors">
          <CreditCard className="h-5 w-5 stroke-[2.2]" />
        </div>
        <div className="min-w-0">
          <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">Collect</div>
          <div className="text-[10px] text-slate-500 truncate">Customer debt</div>
        </div>
      </button>

      {/* 4. Add Expense (EXPENSES) */}
      <button
        onClick={openRecordExpense}
        className="group flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-orange-200/80 bg-linear-to-b from-white to-orange-50/50 p-2.5 text-left shadow-xs transition-all hover:border-orange-300 hover:shadow-md active:scale-98"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-800 group-hover:bg-orange-600 group-hover:text-white transition-colors">
          <Receipt className="h-5 w-5 stroke-[2.2]" />
        </div>
        <div className="min-w-0">
          <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">Expense</div>
          <div className="text-[10px] text-slate-500 truncate">Shop running cost</div>
        </div>
      </button>

      {/* 5. Count Stock (TRACK STOCK) */}
      <button
        onClick={() => openCountStock()}
        className="group flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-amber-200/80 bg-linear-to-b from-white to-amber-50/50 p-2.5 text-left shadow-xs transition-all hover:border-amber-300 hover:shadow-md active:scale-98"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 group-hover:bg-amber-600 group-hover:text-white transition-colors">
          <Scale className="h-5 w-5 stroke-[2.2]" />
        </div>
        <div className="min-w-0">
          <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">Count</div>
          <div className="text-[10px] text-slate-500 truncate">Fix count</div>
        </div>
      </button>

      {/* 6. Weekly Stock Check */}
      <button
        onClick={() => openStockCheck()}
        className="group flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-purple-200/80 bg-linear-to-b from-white to-purple-50/50 p-2.5 text-left shadow-xs transition-all hover:border-purple-300 hover:shadow-md active:scale-98"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-800 group-hover:bg-purple-600 group-hover:text-white transition-colors">
          <CheckSquare className="h-5 w-5 stroke-[2.2]" />
        </div>
        <div className="min-w-0">
          <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">Stock Check</div>
          <div className="text-[10px] text-slate-500 truncate">Weekly count</div>
        </div>
      </button>
    </div>
  );
}
