"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import {
  PackagePlus,
  RefreshCw,
  Database,
  Store,
  User,
  LogOut,
  LogIn,
  MessageSquare,
  History,
  Receipt,
  ShieldCheck,
  ShieldAlert,
  Building,
} from "lucide-react";

export function Navbar() {
  const {
    user,
    isAuthenticated,
    isOwner,
    counts,
    activeTab,
    setActiveTab,
    openAddProduct,
    openAuthModal,
    logout,
    resetWithDemoData,
    isLoading,
    refreshData,
  } = useStock();

  const [isResetting, setIsResetting] = useState(false);

  const handleResetDemo = async () => {
    if (confirm("Load realistic building-material shop demo inventory (Cement, Rebar, PVC, Paint, etc.)?")) {
      setIsResetting(true);
      await resetWithDemoData();
      setIsResetting(false);
    }
  };

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
          {!user?.isPlatformAdmin && (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>{counts.ok} OK</span>
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
              {/* Platform Admin Console Shortcut */}
              {user?.isPlatformAdmin && (
                <button
                  onClick={() => setActiveTab("PLATFORM_ADMIN")}
                  title="Platform Operations Console"
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition-all ${
                    activeTab === "PLATFORM_ADMIN"
                      ? "bg-amber-500 text-slate-950 border-amber-500 shadow-sm"
                      : "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
                  }`}
                >
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-700" />
                  <span>Platform Admin</span>
                </button>
              )}

              {/* Suppliers shortcut (Shop Owner and Staff) */}
              {!user?.isPlatformAdmin && (
                <button
                  onClick={() => setActiveTab("SUPPLIERS")}
                  title="Suppliers & Vendors"
                  className={`hidden md:flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                    activeTab === "SUPPLIERS"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "border-slate-200 bg-white text-emerald-900 hover:bg-emerald-50"
                  }`}
                >
                  <Building className="h-3.5 w-3.5" />
                  <span>Suppliers</span>
                </button>
              )}

              {/* Expenses shortcut (Owner only) */}
              {isOwner && !user?.isPlatformAdmin && (
                <button
                  onClick={() => setActiveTab("EXPENSES")}
                  title="Shop Expenses"
                  className={`hidden md:flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                    activeTab === "EXPENSES"
                      ? "bg-orange-600 text-white border-orange-600 shadow-sm"
                      : "border-slate-200 bg-white text-orange-900 hover:bg-orange-50"
                  }`}
                >
                  <Receipt className="h-3.5 w-3.5" />
                  <span>Expenses</span>
                </button>
              )}

              {/* WhatsApp Assistant Quick Button */}
              <button
                onClick={() => setActiveTab("WHATSAPP")}
                title="Open WhatsApp Assistant"
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                  activeTab === "WHATSAPP"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "border-slate-200 bg-white text-emerald-800 hover:bg-emerald-50"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">WhatsApp</span>
              </button>

              {/* Activity log toggle for desktop */}
              <button
                onClick={() => setActiveTab("ACTIVITY")}
                title="Activity Log"
                className={`hidden lg:flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                  activeTab === "ACTIVITY"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <History className="h-3.5 w-3.5" />
                <span>Activity</span>
              </button>

              {/* Audit Trail toggle (Owner only) */}
              {isOwner && !user?.isPlatformAdmin && (
                <button
                  onClick={() => setActiveTab("AUDIT")}
                  title="Audit Trail"
                  className={`hidden lg:flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                    activeTab === "AUDIT"
                      ? "bg-purple-900 text-white border-purple-900"
                      : "border-slate-200 bg-white text-purple-900 hover:bg-purple-50"
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-purple-700" />
                  <span>Audit</span>
                </button>
              )}

              {/* Sample demo stock (Owner only) */}
              {isOwner && !user?.isPlatformAdmin && (
                <button
                  onClick={handleResetDemo}
                  disabled={isResetting || isLoading}
                  title="Load sample building-material shop data"
                  className="hidden xl:flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-50"
                >
                  <Database className="h-3.5 w-3.5 text-amber-700" />
                  <span>{isResetting ? "Loading..." : "Sample Stock"}</span>
                </button>
              )}

              <button
                onClick={() => refreshData()}
                title="Refresh stock status"
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
                  <span>Add Product</span>
                </button>
              )}

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
