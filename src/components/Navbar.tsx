"use client";

import React from "react";
import { useStock } from "@/context/StockContext";
import {
  PackagePlus,
  RefreshCw,
  Store,
  LogOut,
  LogIn,
  ShieldCheck,
  ShieldAlert,
  Boxes,
  ShoppingCart,
  CreditCard,
  MoreHorizontal,
  History,
} from "lucide-react";

export function Navbar() {
  const {
    user,
    isAuthenticated,
    isOwner,
    counts,
    debtorsCount,
    buyingList,
    activeTab,
    setActiveTab,
    openAddProduct,
    openAuthModal,
    logout,
    isLoading,
    refreshData,
  } = useStock();

  const pendingBuyingCount = buyingList.filter((i) => !i.isCompleted).length;

  return (
    <header className="sticky top-0 z-40 border-b border-amber-900/10 bg-white/95 backdrop-blur-md shadow-xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand & Business Tag */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab("HOME")}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-amber-600 to-orange-700 text-white shadow-md shadow-amber-600/20 active:scale-95 transition-transform"
          >
            <Store className="h-6 w-6 stroke-[2.2]" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("HOME")}
                className="font-black text-xl tracking-tight text-slate-900 font-sans hover:text-amber-800 transition-colors"
              >
                SISPA <span className="text-amber-600 font-extrabold text-sm align-super">1.0</span>
              </button>
              <span className="hidden sm:inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                {user?.isPlatformAdmin
                  ? "SISPA SaaS Platform Operations"
                  : user?.businessName || "Building Materials Shop"}
              </span>
              {isAuthenticated && (
                <button
                  onClick={openAuthModal}
                  title="Click to switch role or account"
                  className={`hidden md:inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border transition-colors ${
                    user?.isPlatformAdmin
                      ? "bg-purple-100 text-purple-900 border-purple-300 hover:bg-purple-200"
                      : isOwner
                      ? "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200"
                      : "bg-blue-100 text-blue-900 border-blue-300 hover:bg-blue-200"
                  }`}
                >
                  <ShieldCheck className="h-3 w-3" />
                  <span>
                    {user?.isPlatformAdmin
                      ? "Platform Admin"
                      : isOwner
                      ? "Shop Owner"
                      : "Staff Operator"}
                  </span>
                  <span className="text-[9px] opacity-70 ml-0.5 font-normal">⇄ Switch</span>
                </button>
              )}
            </div>
            <p className="text-xs font-medium text-slate-500 hidden sm:block">
              {user
                ? user.isPlatformAdmin
                  ? "SaaS Operations • Platform Admin"
                  : `${isOwner ? "Shop Proprietor" : "Counter Desk"} • ${user.fullName}`
                : "Smart Stock & Buying Assistant"}
            </p>
          </div>
        </div>

        {/* Status Pills */}
        <div className="hidden md:flex items-center gap-2">
          {!user?.isPlatformAdmin && counts.runningLow > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700 border border-red-200">
              <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
              <span>{counts.runningLow} Buy Now</span>
            </div>
          )}
          {!user?.isPlatformAdmin && counts.checkSoon > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span>{counts.checkSoon} Buy Soon</span>
            </div>
          )}
          {user?.isPlatformAdmin && (
            <div className="flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-900 border border-purple-200">
              <ShieldAlert className="h-3 w-3 text-purple-700" />
              <span>SaaS Fleet Ops</span>
            </div>
          )}
        </div>

        {/* Actions & Navigation */}
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              {/* PLATFORM ADMIN DESKTOP NAVIGATION */}
              {user?.isPlatformAdmin && (
                <div className="hidden md:flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveTab("PLATFORM_ADMIN")}
                    title="Platform Operations Console"
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition-all ${
                      activeTab === "PLATFORM_ADMIN"
                        ? "bg-purple-900 text-white border-purple-900 shadow-sm"
                        : "border-purple-300 bg-purple-50 text-purple-950 hover:bg-purple-100"
                    }`}
                  >
                    <ShieldAlert className="h-3.5 w-3.5 text-purple-400" />
                    <span>Fleet Ops</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("AUDIT")}
                    title="Platform Audit Log"
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                      activeTab === "AUDIT"
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <History className="h-3.5 w-3.5" />
                    <span>Audit</span>
                  </button>
                </div>
              )}

              {/* BUSINESS OWNER DESKTOP TASK-ORIENTED NAVIGATION */}
              {isOwner && !user?.isPlatformAdmin && (
                <div className="hidden md:flex items-center gap-1">
                  <button
                    onClick={() => setActiveTab("HOME")}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                      activeTab === "HOME"
                        ? "bg-amber-100 text-amber-900"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <span>Home</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("BUYING")}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                      activeTab === "BUYING"
                        ? "bg-amber-100 text-amber-900"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    <span>Buy</span>
                    {pendingBuyingCount > 0 && (
                      <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-black text-white">
                        {pendingBuyingCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab("DEBT")}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                      activeTab === "DEBT"
                        ? "bg-red-50 text-red-900"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    <span>Collect</span>
                    {debtorsCount > 0 && (
                      <span className="rounded-full bg-red-600 px-1.5 py-0.2 text-[10px] font-black text-white">
                        {debtorsCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab("STOCK")}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                      activeTab === "STOCK"
                        ? "bg-amber-100 text-amber-900"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <Boxes className="h-3.5 w-3.5" />
                    <span>Stock</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("MORE")}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                      activeTab === "MORE"
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                    <span>More</span>
                  </button>
                </div>
              )}

              {/* STAFF DESKTOP NAVIGATION */}
              {!isOwner && !user?.isPlatformAdmin && (
                <div className="hidden md:flex items-center gap-1">
                  <button
                    onClick={() => setActiveTab("HOME")}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                      activeTab === "HOME"
                        ? "bg-amber-100 text-amber-900"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span>Counter Desk</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("STOCK")}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                      activeTab === "STOCK"
                        ? "bg-amber-100 text-amber-900"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Boxes className="h-3.5 w-3.5" />
                    <span>Stock</span>
                  </button>
                </div>
              )}

              {/* Refresh data */}
              <button
                onClick={() => refreshData()}
                title="Refresh data"
                disabled={isLoading}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-amber-600" : ""}`} />
              </button>

              {/* Add Product (Shop Owner only) */}
              {isOwner && !user?.isPlatformAdmin && (
                <button
                  onClick={openAddProduct}
                  className="flex items-center gap-1.5 rounded-xl bg-linear-to-r from-amber-600 to-amber-700 px-3.5 py-2 text-xs sm:text-sm font-bold text-white shadow-sm shadow-amber-600/30 hover:from-amber-700 hover:to-amber-800 transition-all active:scale-95"
                >
                  <PackagePlus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add Product</span>
                </button>
              )}

              {/* Sign out */}
              <button
                onClick={logout}
                title="Sign out"
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              onClick={openAuthModal}
              className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-amber-700 transition-all"
            >
              <LogIn className="h-4 w-4" />
              <span>Sign In / Register</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
