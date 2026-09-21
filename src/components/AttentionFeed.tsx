"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import { ProductCard } from "./ProductCard";
import { QuickActionBar } from "./QuickActionBar";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  PackagePlus,
  Scale,
  Sparkles,
  ShoppingBag,
  CreditCard,
  ShoppingCart,
  CheckSquare,
  ArrowRight,
  LogIn,
  Calculator,
  ShieldCheck,
  History,
  RotateCcw,
  Users,
} from "lucide-react";

export function AttentionFeed() {
  const {
    user,
    isAuthenticated,
    isOwner,
    openAuthModal,
    products,
    counts,
    customers,
    totalOutstandingDebt,
    debtorsCount,
    exceptions,
    openAddProduct,
    openCountStock,
    openStockCheck,
    openCashCheck,
    openStaffManagement,
    openSaleCorrection,
    setActiveTab,
    resetWithDemoData,
    isLoading,
  } = useStock();

  const [showOkSection, setShowOkSection] = useState(false);
  const [showNoDataSection, setShowNoDataSection] = useState(true);

  // Group products by urgency status
  const buyNowProducts = products.filter((p) => p.intelligence.status === "RUNNING_LOW");
  const buySoonProducts = products.filter((p) => p.intelligence.status === "CHECK_SOON");
  const okProducts = products.filter((p) => p.intelligence.status === "OK");
  const noDataProducts = products.filter((p) => p.intelligence.status === "NO_DATA");
  const negativeStockProducts = products.filter((p) => p.currentStock < 0);

  // Unauthenticated zero state
  if (!isLoading && !isAuthenticated) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-100 text-amber-800 shadow-md">
          <ShoppingBag className="h-10 w-10" />
        </div>
        <h2 className="mt-6 text-2xl font-black text-slate-900 tracking-tight">
          Welcome to SISPA 1.0
        </h2>
        <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
          Smart Stock & Buying Assistant for building-material shops. Tell me what I need to buy before I run out.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={openAuthModal}
            className="flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-amber-600 px-6 py-3 font-bold text-white shadow-md shadow-amber-600/30 hover:bg-amber-700 transition-transform active:scale-95"
          >
            <LogIn className="h-5 w-5" />
            <span>Sign In / Create Account</span>
          </button>
        </div>
      </div>
    );
  }

  // Zero State: No products in the shop yet
  if (!isLoading && products.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-100 text-amber-800 shadow-md">
          <ShoppingBag className="h-10 w-10" />
        </div>
        <h2 className="mt-6 text-2xl font-black text-slate-900 tracking-tight">
          Let&apos;s get your stock ready
        </h2>
        <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
          Add the products you sell in your shop and tell us how many you have today. We&apos;ll help you know what to buy before you run out.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={openAddProduct}
            className="flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-amber-600 px-6 py-3 font-bold text-white shadow-md shadow-amber-600/30 hover:bg-amber-700 transition-transform active:scale-95"
          >
            <PackagePlus className="h-5 w-5" />
            <span>Add First Product</span>
          </button>

          <button
            onClick={() => resetWithDemoData()}
            className="flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Sparkles className="h-5 w-5 text-amber-600" />
            <span>Load Sample Shop Stock</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Quick Action Bar (Sell, Receive, Collect, Expense, Count, Stock Check) */}
      <QuickActionBar />

      {/* TOP 3 ATTENTION CARDS: MONEY TO COLLECT, STOCK TO BUY, STOCK CHECK */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. MONEY TO COLLECT */}
        <div
          onClick={() => setActiveTab("DEBT")}
          className="cursor-pointer group relative overflow-hidden rounded-3xl border border-red-200/90 bg-linear-to-br from-white via-red-50/40 to-red-100/30 p-4 sm:p-5 shadow-xs transition-all hover:shadow-md hover:border-red-300"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-900">
              <span className="h-2 w-2 rounded-full bg-red-600" />
              Money to Collect
            </span>
            <CreditCard className="h-5 w-5 text-red-600" />
          </div>

          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              ₦{totalOutstandingDebt.toLocaleString()}
            </span>
          </div>

          <p className="mt-1 text-xs text-slate-600">
            {debtorsCount > 0
              ? `${debtorsCount} customers owe pending debt.`
              : "All customer accounts are clear!"}
          </p>

          <div className="mt-3 flex items-center justify-between pt-2 border-t border-red-200/60 text-xs font-bold text-red-800">
            <span>View who owes</span>
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* 2. STOCK TO BUY */}
        <div
          onClick={() => setActiveTab("BUYING")}
          className="cursor-pointer group relative overflow-hidden rounded-3xl border border-amber-200/90 bg-linear-to-br from-white via-amber-50/40 to-amber-100/30 p-4 sm:p-5 shadow-xs transition-all hover:shadow-md hover:border-amber-300"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Stock to Buy
            </span>
            <ShoppingCart className="h-5 w-5 text-amber-600" />
          </div>

          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {buyNowProducts.length + buySoonProducts.length}
            </span>
            <span className="text-xs font-bold text-slate-600">products need attention</span>
          </div>

          <p className="mt-1 text-xs text-slate-600">
            {buyNowProducts.length > 0
              ? `${buyNowProducts.length} critical items will finish soon.`
              : "Replenishment coverage is steady."}
          </p>

          <div className="mt-3 flex items-center justify-between pt-2 border-t border-amber-200/60 text-xs font-bold text-amber-900">
            <span>Open buying list</span>
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* 3. WEEKLY STOCK CHECK */}
        <div
          onClick={() => openStockCheck()}
          className="cursor-pointer group relative overflow-hidden rounded-3xl border border-purple-200/90 bg-linear-to-br from-white via-purple-50/40 to-purple-100/30 p-4 sm:p-5 shadow-xs transition-all hover:shadow-md hover:border-purple-300"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-900">
              <span className="h-2 w-2 rounded-full bg-purple-600" />
              Weekly Stock Check
            </span>
            <CheckSquare className="h-5 w-5 text-purple-600" />
          </div>

          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {products.length}
            </span>
            <span className="text-xs font-bold text-slate-600">ready to count</span>
          </div>

          <p className="mt-1 text-xs text-slate-600">
            Reconcile physical stock against recorded system numbers.
          </p>

          <div className="mt-3 flex items-center justify-between pt-2 border-t border-purple-200/60 text-xs font-bold text-purple-900">
            <span>Start weekly count</span>
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>

      {/* BUSINESS EXCEPTIONS BANNER ("This needs checking") */}
      {exceptions.length > 0 && (
        <div className="rounded-3xl border border-amber-200 bg-linear-to-r from-amber-50 via-white to-amber-50/50 p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h3 className="text-sm font-bold text-slate-900">
                This Needs Checking ({exceptions.length} business exceptions)
              </h3>
            </div>
            <span className="text-xs text-slate-500">Neutral exception review</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {exceptions.map((ex) => (
              <div
                key={ex.id}
                className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        ex.severity === "URGENT" ? "bg-red-600" : "bg-amber-500"
                      }`}
                    />
                    <span className="font-bold text-xs text-slate-900">{ex.title}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">{ex.description}</p>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Action:</span>
                  <button
                    onClick={() => {
                      if (ex.actionTab) setActiveTab(ex.actionTab);
                    }}
                    className="text-xs font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1"
                  >
                    <span>{ex.actionText}</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OWNER CONTROLS STRIP (Cash check, staff management, sale corrections) */}
      {isOwner && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <ShieldCheck className="h-4 w-4 text-purple-700" />
            <span>Owner Control Tools:</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={openCashCheck}
              className="flex items-center gap-1 rounded-xl border border-purple-200 bg-white px-2.5 py-1.5 font-bold text-purple-800 hover:bg-purple-50 shadow-2xs"
            >
              <Calculator className="h-3.5 w-3.5" />
              <span>Check Today&apos;s Money</span>
            </button>

            <button
              onClick={openStaffManagement}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 shadow-2xs"
            >
              <Users className="h-3.5 w-3.5 text-slate-500" />
              <span>Manage Staff</span>
            </button>

            <button
              onClick={openSaleCorrection}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 shadow-2xs"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              <span>Sale Correction</span>
            </button>
          </div>
        </div>
      )}

      {/* Feed Section Title */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 pt-2">
        <div>
          <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
            Stock Urgency Feed
          </h3>
          <p className="text-xs text-slate-500">
            What will finish first based on sales pace and shop coverage.
          </p>
        </div>
      </div>

      {/* SECTION 1: 🔴 BUY NOW */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-white shadow-xs">
            <AlertCircle className="h-4 w-4" />
          </div>
          <h3 className="text-base sm:text-lg font-black text-slate-900">
            BUY NOW
            <span className="ml-2 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
              {buyNowProducts.length} {buyNowProducts.length === 1 ? "item" : "items"}
            </span>
          </h3>
        </div>

        {buyNowProducts.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {buyNowProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-center text-xs text-slate-500">
            <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-500 mb-1" />
            <p className="font-semibold text-slate-700">No urgent items running out right now!</p>
          </div>
        )}
      </section>

      {/* SECTION 2: 🟡 BUY SOON */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white shadow-xs">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <h3 className="text-base sm:text-lg font-black text-slate-900">
            BUY SOON
            <span className="ml-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              {buySoonProducts.length} {buySoonProducts.length === 1 ? "item" : "items"}
            </span>
          </h3>
        </div>

        {buySoonProducts.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {buySoonProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-center text-xs text-slate-500">
            <p className="font-medium">No products approaching reorder point soon.</p>
          </div>
        )}
      </section>

      {/* SECTION 3: 🟢 OK (Collapsible) */}
      <section className="space-y-3 pt-2">
        <button
          onClick={() => setShowOkSection(!showOkSection)}
          className="flex w-full items-center justify-between rounded-xl bg-slate-50 p-3 text-left border border-slate-200/80 hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold text-slate-900">
              OK — Healthy Products
            </span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
              {okProducts.length}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span>{showOkSection ? "Hide healthy items" : "Show healthy items"}</span>
            {showOkSection ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>

        {showOkSection && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-1">
            {okProducts.map((product) => (
              <ProductCard key={product.id} product={product} compact />
            ))}
          </div>
        )}
      </section>

      {/* SECTION 4: ⚪ NO DATA */}
      {noDataProducts.length > 0 && (
        <section className="space-y-3 pt-2">
          <button
            onClick={() => setShowNoDataSection(!showNoDataSection)}
            className="flex w-full items-center justify-between rounded-xl bg-slate-50 p-3 text-left border border-slate-200/80 hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-400 text-white">
                <HelpCircle className="h-4 w-4" />
              </div>
              <span className="text-sm font-bold text-slate-800">
                NO DATA — Needs More Sales History
              </span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
                {noDataProducts.length}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500">
              {showNoDataSection ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </button>

          {showNoDataSection && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 px-1">
                Not enough sales recorded yet. Keep recording your daily sales and we&apos;ll give you a better estimate.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {noDataProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
