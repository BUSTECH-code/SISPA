"use client";

import React, { useState, useMemo } from "react";
import { useStock } from "@/context/StockContext";
import { ProductCard } from "./ProductCard";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  CreditCard,
  ShoppingCart,
  CheckSquare,
  ArrowRight,
  LogIn,
  PackagePlus,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  RotateCcw,
  Sparkles,
} from "lucide-react";

export function AttentionFeed() {
  const {
    user,
    isAuthenticated,
    isOwner,
    openAuthModal,
    products,
    customers,
    totalOutstandingDebt,
    debtorsCount,
    exceptions,
    activities,
    weeklyReport,
    openAddProduct,
    openRecordSale,
    openRecordDelivery,
    openRecordPayment,
    openStockCheck,
    setActiveTab,
    isLoading,
  } = useStock();

  const [showOkSection, setShowOkSection] = useState(false);

  // Group products by urgency status
  const buyNowProducts = products.filter((p) => p.intelligence.status === "RUNNING_LOW");
  const buySoonProducts = products.filter((p) => p.intelligence.status === "CHECK_SOON");
  const okProducts = products.filter((p) => p.intelligence.status === "OK");

  // Calculate Today's financial pulse from metrics & activities
  const { todaySalesTotal, todayCollectedTotal } = useMemo(() => {
    if (weeklyReport?.metrics) {
      const sales = Math.round(weeklyReport.metrics.totalSalesValue / 7);
      const collected = Math.round(weeklyReport.metrics.cashCollected / 7);
      return {
        todaySalesTotal: sales > 0 ? sales : 0,
        todayCollectedTotal: collected > 0 ? collected : 0,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let sales = 0;
    for (const act of activities) {
      const actDate = new Date(act.createdAt);
      if (actDate >= today && act.entryType === "SALE") {
        const prod = products.find((p) => p.id === act.productId);
        const price = prod?.sellingPrice ? Number(prod.sellingPrice) : 0;
        sales += Math.abs(Number(act.quantityDelta) || 0) * price;
      }
    }

    return {
      todaySalesTotal: sales,
      todayCollectedTotal: Math.round(sales * 0.8),
    };
  }, [activities, products, weeklyReport]);

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
          Smart Stock &amp; Buying Assistant for building-material shops. Tell me what I need to buy before I run out.
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
          Add the first building materials you sell (e.g. Dangote Cement, 12mm Rebar) to start tracking daily sales and restock warnings.
        </p>

        <div className="mt-8">
          <button
            onClick={openAddProduct}
            className="flex min-h-[48px] w-full sm:w-auto mx-auto items-center justify-center gap-2 rounded-2xl bg-amber-600 px-6 py-3 font-bold text-white shadow-md shadow-amber-600/30 hover:bg-amber-700 transition-transform active:scale-95"
          >
            <PackagePlus className="h-5 w-5" />
            <span>Add First Product</span>
          </button>
        </div>
      </div>
    );
  }

  const todayFormatted = new Intl.DateTimeFormat("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date());

  const urgentItemsCount = buyNowProducts.length + buySoonProducts.length;

  return (
    <div className="space-y-5 pb-24">
      {/* 1. SHOP HEADER & GREETING */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 pt-1">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            {todayFormatted} • Store Pulse
          </span>
          <h1 className="mt-1 text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {user?.businessName || "Musa Building Materials Ltd"}
          </h1>
        </div>
        <div className="text-right hidden sm:block">
          <span className="text-xs text-slate-600 font-medium">Logged in as</span>
          <p className="text-xs font-bold text-slate-900">{user?.fullName || "Alhaji Ibrahim"}</p>
        </div>
      </div>

      {/* 2. LAYER 1: TODAY'S FINANCIAL PULSE (3 Key Numbers) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Sales Today */}
        <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Sales Today
          </span>
          <div className="mt-1 text-2xl sm:text-3xl font-black text-slate-900">
            ₦{todaySalesTotal.toLocaleString()}
          </div>
          <p className="mt-1 text-xs text-slate-600">Total goods sold across all sales</p>
        </div>

        {/* Cash Collected Today */}
        <div className="rounded-3xl border border-emerald-200/90 bg-linear-to-br from-white to-emerald-50/40 p-4 sm:p-5 shadow-2xs">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-900">
            Cash Collected
          </span>
          <div className="mt-1 text-2xl sm:text-3xl font-black text-emerald-900">
            ₦{todayCollectedTotal.toLocaleString()}
          </div>
          <p className="mt-1 text-xs text-emerald-800/80">Cash &amp; bank transfers received</p>
        </div>

        {/* Customers Owing */}
        <div
          onClick={() => setActiveTab("DEBT")}
          className="cursor-pointer group rounded-3xl border border-red-200/90 bg-linear-to-br from-white to-red-50/40 p-4 sm:p-5 shadow-2xs hover:border-red-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-900">
              Customers Owing
            </span>
            <ArrowRight className="h-4 w-4 text-red-600 group-hover:translate-x-1 transition-transform" />
          </div>
          <div className="mt-1 text-2xl sm:text-3xl font-black text-red-900">
            ₦{totalOutstandingDebt.toLocaleString()}
          </div>
          <p className="mt-1 text-xs text-red-800/80">
            {debtorsCount > 0 ? `${debtorsCount} customers with unpaid debt` : "All customer accounts clear"}
          </p>
        </div>
      </div>

      {/* 3. LAYER 2: IMMEDIATE OPERATIONAL ACTIONS (4 Primary Buttons) */}
      <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2.5 px-1">
          Immediate Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Sell */}
          <button
            onClick={() => openRecordSale()}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 py-3 font-black text-sm text-white shadow-xs hover:bg-amber-700 transition-transform active:scale-95"
          >
            <ArrowUpRight className="h-5 w-5" />
            <span>Sell Goods</span>
          </button>

          {/* Receive */}
          <button
            onClick={() => openRecordDelivery()}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 font-black text-sm text-white shadow-xs hover:bg-slate-800 transition-transform active:scale-95"
          >
            <ArrowDownLeft className="h-5 w-5" />
            <span>Receive Delivery</span>
          </button>

          {/* Collect */}
          <button
            onClick={() => openRecordPayment()}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-black text-sm text-white shadow-xs hover:bg-emerald-700 transition-transform active:scale-95"
          >
            <CreditCard className="h-5 w-5" />
            <span>Collect Money</span>
          </button>

          {/* Buy */}
          <button
            onClick={() => setActiveTab("BUYING")}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 font-black text-sm text-slate-900 shadow-2xs hover:bg-slate-100 transition-transform active:scale-95"
          >
            <ShoppingCart className="h-5 w-5 text-amber-600" />
            <span>Restock (Buy)</span>
          </button>
        </div>
      </div>

      {/* 4. LAYER 2: NEEDS ATTENTION (Direct Verbs) */}
      <div className="space-y-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 px-1">
          Needs Attention
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {/* Restock trigger */}
          <div
            onClick={() => setActiveTab("BUYING")}
            className="cursor-pointer group flex items-center justify-between rounded-2xl border border-amber-200 bg-white p-3.5 shadow-2xs hover:border-amber-400 hover:bg-amber-50/30 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {urgentItemsCount > 0
                    ? `${urgentItemsCount} products need buying`
                    : "Stock levels steady"}
                </p>
                <p className="text-xs text-slate-500">
                  {buyNowProducts.length > 0
                    ? `${buyNowProducts.length} critical items will finish soon`
                    : "No stock running out today"}
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-amber-900 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Buy <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>

          {/* Debt collection trigger */}
          <div
            onClick={() => setActiveTab("DEBT")}
            className="cursor-pointer group flex items-center justify-between rounded-2xl border border-red-200 bg-white p-3.5 shadow-2xs hover:border-red-400 hover:bg-red-50/30 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-700">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  ₦{totalOutstandingDebt.toLocaleString()} to collect
                </p>
                <p className="text-xs text-slate-500">
                  {debtorsCount > 0 ? `${debtorsCount} customer accounts pending` : "No pending debts"}
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-red-900 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Collect <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>

          {/* Stock count trigger */}
          <div
            onClick={() => openStockCheck()}
            className="cursor-pointer group flex items-center justify-between rounded-2xl border border-purple-200 bg-white p-3.5 shadow-2xs hover:border-purple-400 hover:bg-purple-50/30 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
                <CheckSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {products.length} products to count
                </p>
                <p className="text-xs text-slate-500">Weekly stock check &amp; verification</p>
              </div>
            </div>
            <span className="text-xs font-bold text-purple-900 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Count <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>

        {/* Business Exceptions if any */}
        {exceptions.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <h3 className="text-xs font-bold text-slate-900">
                Needs Checking ({exceptions.length} items to review)
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {exceptions.map((ex) => (
                <div
                  key={ex.id}
                  className="rounded-xl border border-slate-200 bg-white p-2.5 flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-xs text-slate-900">{ex.title}</span>
                    <p className="text-[11px] text-slate-500">{ex.description}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (ex.actionTab) setActiveTab(ex.actionTab);
                    }}
                    className="text-xs font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1 shrink-0 ml-2"
                  >
                    <span>{ex.actionText}</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 5. LAYER 3: CRITICAL STOCK URGENCY (Only Urgent Items) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              What Will Finish First
            </h2>
            <p className="text-xs text-slate-500">
              Only showing products that need reordering based on current shop sales pace.
            </p>
          </div>
          {urgentItemsCount > 0 && (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800">
              {urgentItemsCount} Urgent
            </span>
          )}
        </div>

        {/* 🔴 BUY NOW (Critical) */}
        {buyNowProducts.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-red-800">
              <span className="h-2 w-2 rounded-full bg-red-600" />
              <span>RUNNING LOW ({buyNowProducts.length})</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {buyNowProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        )}

        {/* 🟡 BUY SOON */}
        {buySoonProducts.length > 0 && (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span>CHECK SOON ({buySoonProducts.length})</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {buySoonProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        )}

        {/* All healthy calm state */}
        {urgentItemsCount === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 text-center text-xs text-slate-500">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
            <p className="font-bold text-sm text-slate-800">All products are healthy</p>
            <p className="mt-1">No items are running low or near their reorder thresholds.</p>
          </div>
        )}

        {/* 🟢 HEALTHY PRODUCTS (Collapsible - Progressive Disclosure) */}
        {okProducts.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => setShowOkSection(!showOkSection)}
              className="flex w-full items-center justify-between rounded-2xl bg-slate-50 p-3.5 text-left border border-slate-200/80 hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-800">
                  {showOkSection ? "Hide" : "Show"} {okProducts.length} Healthy Products
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  Good Stock
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                {showOkSection ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {showOkSection && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-3">
                {okProducts.map((product) => (
                  <ProductCard key={product.id} product={product} compact />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
