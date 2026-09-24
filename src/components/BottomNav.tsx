"use client";

import React from "react";
import { useStock } from "@/context/StockContext";
import {
  AlertCircle,
  Boxes,
  ShoppingCart,
  CreditCard,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownLeft,
  CheckSquare,
  ShieldAlert,
  History,
} from "lucide-react";

export function BottomNav() {
  const {
    activeTab,
    setActiveTab,
    counts,
    debtorsCount,
    buyingList,
    isOwner,
    user,
    openRecordSale,
    openRecordDelivery,
    openCountStock,
    openRecordPayment,
    canPerform,
  } = useStock();

  const pendingBuyingCount = buyingList.filter((i) => !i.isCompleted).length;

  // 1. PLATFORM ADMIN ENVIRONMENT (Platform Fleet Controls Only)
  if (user?.isPlatformAdmin) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-purple-200 bg-white/95 backdrop-blur-md pb-safe">
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
          <button
            onClick={() => setActiveTab("PLATFORM_ADMIN")}
            className={`flex min-h-[48px] min-w-[64px] flex-col items-center justify-center rounded-xl px-2 py-1 transition-colors ${
              activeTab === "PLATFORM_ADMIN"
                ? "text-purple-800 font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShieldAlert className="h-5 w-5 text-purple-700" />
            <span className="mt-1 text-[11px] font-bold">Fleet Ops</span>
          </button>

          <button
            onClick={() => setActiveTab("AUDIT")}
            className={`flex min-h-[48px] min-w-[64px] flex-col items-center justify-center rounded-xl px-2 py-1 transition-colors ${
              activeTab === "AUDIT"
                ? "text-purple-800 font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <History className="h-5 w-5" />
            <span className="mt-1 text-[11px] font-bold">Platform Audit</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. BUSINESS STAFF ENVIRONMENT (Counter Desk Operations)
  if (!isOwner) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-md pb-safe">
        <div className="mx-auto flex max-w-lg items-center justify-around px-1 py-1">
          {/* Staff Home */}
          <button
            onClick={() => setActiveTab("HOME")}
            className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 transition-colors ${
              activeTab === "HOME" ? "text-amber-700 font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <AlertCircle className="h-5 w-5" />
            <span className="mt-1 text-[10px] leading-none">Counter</span>
          </button>

          {/* Sell Goods */}
          {canPerform("CAN_SELL") && (
            <button
              onClick={() => openRecordSale()}
              className="flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 text-slate-700 hover:text-amber-800 transition-colors"
            >
              <ArrowUpRight className="h-5 w-5 text-amber-700" />
              <span className="mt-1 text-[10px] font-bold leading-none">Sell</span>
            </button>
          )}

          {/* Receive Goods */}
          {canPerform("CAN_RECEIVE") && (
            <button
              onClick={() => openRecordDelivery()}
              className="flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 text-slate-700 hover:text-slate-900 transition-colors"
            >
              <ArrowDownLeft className="h-5 w-5 text-slate-800" />
              <span className="mt-1 text-[10px] font-bold leading-none">Receive</span>
            </button>
          )}

          {/* Collect Debt */}
          {canPerform("CAN_COLLECT") && (
            <button
              onClick={() => openRecordPayment()}
              className="flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 text-slate-700 hover:text-amber-800 transition-colors"
            >
              <CreditCard className="h-5 w-5 text-amber-700" />
              <span className="mt-1 text-[10px] font-bold leading-none">Collect</span>
            </button>
          )}

          {/* Stock Catalog */}
          <button
            onClick={() => setActiveTab("STOCK")}
            className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 transition-colors ${
              activeTab === "STOCK" ? "text-amber-700 font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Boxes className="h-5 w-5" />
            <span className="mt-1 text-[10px] leading-none">Stock</span>
          </button>

          {/* Count Stock */}
          {canPerform("CAN_COUNT") && (
            <button
              onClick={() => openCountStock()}
              className="flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 text-slate-700 hover:text-purple-800 transition-colors"
            >
              <CheckSquare className="h-5 w-5 text-purple-700" />
              <span className="mt-1 text-[10px] font-bold leading-none">Count</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // 3. BUSINESS OWNER ENVIRONMENT (Task-Oriented 5-Task + More Navigation)
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-md pb-safe">
      <div className="mx-auto flex max-w-lg items-center justify-around px-1 py-1">
        {/* 1. Home (Pulse & Attention) */}
        <button
          onClick={() => setActiveTab("HOME")}
          className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 transition-colors ${
            activeTab === "HOME" ? "text-amber-700 font-black" : "text-slate-600 hover:text-slate-900"
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
          <span className="mt-1 text-[10px] leading-none">Home</span>
        </button>

        {/* 2. Sell (Direct Fast Action Launcher) */}
        <button
          onClick={() => openRecordSale()}
          className="flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 text-slate-700 hover:text-amber-800 transition-colors"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
            <ArrowUpRight className="h-4 w-4" />
          </div>
          <span className="mt-0.5 text-[10px] font-bold text-amber-900 leading-none">Sell</span>
        </button>

        {/* 3. Buy (Restock & Outlay) */}
        <button
          onClick={() => setActiveTab("BUYING")}
          className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 transition-colors ${
            activeTab === "BUYING" ? "text-amber-700 font-black" : "text-slate-600 hover:text-slate-900"
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
          <span className="mt-1 text-[10px] leading-none">Buy</span>
        </button>

        {/* 4. Collect (Debt Recovery) */}
        <button
          onClick={() => setActiveTab("DEBT")}
          className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 transition-colors ${
            activeTab === "DEBT" ? "text-red-700 font-black" : "text-slate-600 hover:text-slate-900"
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
          <span className="mt-1 text-[10px] leading-none">Collect</span>
        </button>

        {/* 5. Stock (Inventory Catalog) */}
        <button
          onClick={() => setActiveTab("STOCK")}
          className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 transition-colors ${
            activeTab === "STOCK" ? "text-amber-700 font-black" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Boxes className="h-5 w-5" />
          <span className="mt-1 text-[10px] leading-none">Stock</span>
        </button>

        {/* 6. More (Business Tools, Staff, Reports, Settings) */}
        <button
          onClick={() => setActiveTab("MORE")}
          className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-1 py-1 transition-colors ${
            activeTab === "MORE" ? "text-amber-700 font-black" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="mt-1 text-[10px] leading-none">More</span>
        </button>
      </div>
    </div>
  );
}
