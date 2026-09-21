"use client";

import React from "react";
import { useStock } from "@/context/StockContext";
import {
  AlertCircle,
  Boxes,
  ShoppingCart,
  CreditCard,
  FileText,
  MessageSquare,
} from "lucide-react";

export function BottomNav() {
  const {
    activeTab,
    setActiveTab,
    counts,
    debtorsCount,
    buyingList,
  } = useStock();

  const pendingBuyingCount = buyingList.filter((i) => !i.isCompleted).length;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-md pb-safe">
      <div className="mx-auto flex max-w-lg items-center justify-around px-1 py-1">
        {/* Tab 1: Attention (Home) */}
        <button
          onClick={() => setActiveTab("HOME")}
          className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 transition-colors ${
            activeTab === "HOME"
              ? "text-amber-700 font-bold"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <div className="relative">
            <AlertCircle className="h-5 w-5" />
            {counts.runningLow > 0 && (
              <span className="absolute -top-1 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-xs">
                {counts.runningLow}
              </span>
            )}
          </div>
          <span className="mt-1 text-[10px] leading-none">Attention</span>
        </button>

        {/* Tab 2: Stock (Catalog) */}
        <button
          onClick={() => setActiveTab("STOCK")}
          className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 transition-colors ${
            activeTab === "STOCK"
              ? "text-amber-700 font-bold"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Boxes className="h-5 w-5" />
          <span className="mt-1 text-[10px] leading-none">Stock</span>
        </button>

        {/* Tab 3: Debt / Collect */}
        <button
          onClick={() => setActiveTab("DEBT")}
          className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 transition-colors ${
            activeTab === "DEBT"
              ? "text-amber-700 font-bold"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <div className="relative">
            <CreditCard className="h-5 w-5" />
            {debtorsCount > 0 && (
              <span className="absolute -top-1 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-xs">
                {debtorsCount}
              </span>
            )}
          </div>
          <span className="mt-1 text-[10px] leading-none">Debt</span>
        </button>

        {/* Tab 4: Buying List */}
        <button
          onClick={() => setActiveTab("BUYING")}
          className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 transition-colors ${
            activeTab === "BUYING"
              ? "text-amber-700 font-bold"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <div className="relative">
            <ShoppingCart className="h-5 w-5" />
            {pendingBuyingCount > 0 && (
              <span className="absolute -top-1 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-bold text-white shadow-xs">
                {pendingBuyingCount}
              </span>
            )}
          </div>
          <span className="mt-1 text-[10px] leading-none">Buying</span>
        </button>

        {/* Tab 5: Reports */}
        <button
          onClick={() => setActiveTab("REPORTS")}
          className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 transition-colors ${
            activeTab === "REPORTS"
              ? "text-amber-700 font-bold"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <FileText className="h-5 w-5" />
          <span className="mt-1 text-[10px] leading-none">Reports</span>
        </button>

        {/* Tab 6: WhatsApp Assistant */}
        <button
          onClick={() => setActiveTab("WHATSAPP")}
          className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 transition-colors ${
            activeTab === "WHATSAPP"
              ? "text-emerald-700 font-bold"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <MessageSquare className="h-5 w-5" />
          <span className="mt-1 text-[10px] leading-none">WhatsApp</span>
        </button>
      </div>
    </div>
  );
}
