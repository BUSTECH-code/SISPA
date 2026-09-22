"use client";

import React, { useState } from "react";
import { useStock, type EnrichedProduct, type EnrichedCustomer } from "@/context/StockContext";
import {
  ShoppingBag,
  Truck,
  CreditCard,
  Boxes,
  Search,
  CheckCircle,
  AlertCircle,
  Phone,
  ArrowRight,
  Clock,
  Sparkles,
} from "lucide-react";

export function StaffHomeView() {
  const {
    user,
    products,
    customers,
    activities,
    openRecordSale,
    openRecordDelivery,
    openRecordPayment,
    openCountStock,
    openProductDetails,
    setActiveTab,
  } = useStock();

  const [searchTerm, setSearchTerm] = useState("");

  // Filter products and customers matching quick search
  const query = searchTerm.trim().toLowerCase();
  const matchedProducts = query
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query) ||
          p.unit.toLowerCase().includes(query)
      ).slice(0, 6)
    : [];

  const matchedCustomers = query
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          (c.phone && c.phone.includes(query))
      ).slice(0, 4)
    : [];

  // Today's operational stats for staff
  const today = new Date().toDateString();
  const todayActivities = activities.filter(
    (a) => new Date(a.createdAt).toDateString() === today
  );
  const salesCountToday = todayActivities.filter((a) => a.entryType === "SALE").length;
  const deliveriesCountToday = todayActivities.filter((a) => a.entryType === "RESTOCK").length;

  return (
    <div className="space-y-6 pb-20">
      {/* Staff Operational Station Header */}
      <div className="rounded-3xl bg-linear-to-br from-slate-900 via-slate-800 to-amber-950 p-6 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-bold text-amber-300 border border-amber-400/30">
                Staff Operations Desk
              </span>
              <span className="text-xs text-slate-300">
                {user?.businessName}
              </span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-white">
              Welcome, {user?.fullName?.split(" ")[0] || "Operator"}
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-300">
              Quickly record shop sales, deliveries, collections, and shelf counts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-2xl bg-white/10 px-4 py-2.5 text-center backdrop-blur-xs border border-white/10">
              <div className="text-xs text-slate-300">Today&apos;s Sales</div>
              <div className="text-xl font-black text-white">{salesCountToday}</div>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-2.5 text-center backdrop-blur-xs border border-white/10">
              <div className="text-xs text-slate-300">Deliveries</div>
              <div className="text-xl font-black text-white">{deliveriesCountToday}</div>
            </div>
          </div>
        </div>
      </div>

      {/* The 4 Primary Operational Action Cards (Large Touch Targets) */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          Primary Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Action 1: Sell Goods */}
          <button
            onClick={() => openRecordSale()}
            className="group flex flex-col justify-between rounded-3xl border-2 border-emerald-500/40 bg-emerald-50/50 p-5 text-left transition-all hover:bg-emerald-50 hover:border-emerald-600 hover:shadow-md active:scale-98"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/30 group-hover:scale-105 transition-transform">
                <ShoppingBag className="h-6 w-6 stroke-[2.2]" />
              </div>
              <span className="rounded-full bg-emerald-200/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-900">
                F1 • Sale
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-base font-black text-emerald-950">Record Sale</h3>
              <p className="mt-1 text-xs text-emerald-800/80 font-medium">
                Customer purchase with cash, bank transfer, POS, or credit debt.
              </p>
            </div>
          </button>

          {/* Action 2: Receive Goods */}
          <button
            onClick={() => openRecordDelivery()}
            className="group flex flex-col justify-between rounded-3xl border-2 border-blue-500/40 bg-blue-50/50 p-5 text-left transition-all hover:bg-blue-50 hover:border-blue-600 hover:shadow-md active:scale-98"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/30 group-hover:scale-105 transition-transform">
                <Truck className="h-6 w-6 stroke-[2.2]" />
              </div>
              <span className="rounded-full bg-blue-200/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-blue-900">
                F2 • Restock
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-base font-black text-blue-950">Receive Delivery</h3>
              <p className="mt-1 text-xs text-blue-800/80 font-medium">
                Incoming goods arrival. Record quantity and supplier name.
              </p>
            </div>
          </button>

          {/* Action 3: Collect Payment */}
          <button
            onClick={() => openRecordPayment()}
            className="group flex flex-col justify-between rounded-3xl border-2 border-amber-500/40 bg-amber-50/50 p-5 text-left transition-all hover:bg-amber-50 hover:border-amber-600 hover:shadow-md active:scale-98"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-md shadow-amber-600/30 group-hover:scale-105 transition-transform">
                <CreditCard className="h-6 w-6 stroke-[2.2]" />
              </div>
              <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-900">
                F3 • Collect
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-base font-black text-amber-950">Collect Debt</h3>
              <p className="mt-1 text-xs text-amber-800/80 font-medium">
                Record customer paying back money they owe the shop.
              </p>
            </div>
          </button>

          {/* Action 4: Count Stock */}
          <button
            onClick={() => openCountStock()}
            className="group flex flex-col justify-between rounded-3xl border-2 border-purple-500/40 bg-purple-50/50 p-5 text-left transition-all hover:bg-purple-50 hover:border-purple-600 hover:shadow-md active:scale-98"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-600 text-white shadow-md shadow-purple-600/30 group-hover:scale-105 transition-transform">
                <Boxes className="h-6 w-6 stroke-[2.2]" />
              </div>
              <span className="rounded-full bg-purple-200/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-purple-900">
                F4 • Count
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-base font-black text-purple-950">Count Stock</h3>
              <p className="mt-1 text-xs text-purple-800/80 font-medium">
                Count items on shelf or yard and record physical tally.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Fast Universal Search (Product & Customer Finder) */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Fast Finder</h2>
          <p className="text-xs text-slate-500">
            Search product stock or check customer debt balances in seconds.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Type product name (e.g. Dangote Cement, 12mm Rebar) or customer name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full min-h-[48px] rounded-2xl border-2 border-slate-200 pl-11 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-hidden"
          />
        </div>

        {/* Live Search Results */}
        {query && (
          <div className="space-y-4 pt-2">
            {/* Products Match */}
            {matchedProducts.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Matching Products ({matchedProducts.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {matchedProducts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-3 hover:bg-slate-50"
                    >
                      <div>
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">{p.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {p.category} • Selling: <strong className="text-slate-900">₦{Number(p.sellingPrice).toLocaleString()}</strong> / {p.unit}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            p.intelligence.status === "RUNNING_LOW" || p.currentStock <= 0
                              ? "bg-red-100 text-red-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {p.currentStock} {p.unit} left
                        </span>
                        <button
                          onClick={() => openRecordSale(p)}
                          className="rounded-xl bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          Sell
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Customers Match */}
            {matchedCustomers.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Matching Customers ({matchedCustomers.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {matchedCustomers.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-3 hover:bg-slate-50"
                    >
                      <div>
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">{c.name}</div>
                        {c.phone && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            <span>{c.phone}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            c.outstandingBalance > 0
                              ? "bg-red-100 text-red-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {c.outstandingBalance > 0 ? `Owes ₦${c.outstandingBalance.toLocaleString()}` : "No Debt"}
                        </span>
                        {c.outstandingBalance > 0 && (
                          <button
                            onClick={() => openRecordPayment(c)}
                            className="rounded-xl bg-amber-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-amber-700"
                          >
                            Collect
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {matchedProducts.length === 0 && matchedCustomers.length === 0 && (
              <div className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">
                No items or customers matched &quot;{searchTerm}&quot;.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Today's Recent Operational Activity */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Recent Shop Activity</h2>
            <p className="text-xs text-slate-500">Latest actions recorded in the shop.</p>
          </div>
          <button
            onClick={() => setActiveTab("ACTIVITY")}
            className="text-xs font-bold text-amber-700 hover:text-amber-800"
          >
            View All
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {activities.slice(0, 6).map((item) => (
            <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white font-bold text-[10px] ${
                    item.entryType === "SALE"
                      ? "bg-emerald-600"
                      : item.entryType === "RESTOCK"
                      ? "bg-blue-600"
                      : "bg-purple-600"
                  }`}
                >
                  {item.entryType === "SALE" ? "S" : item.entryType === "RESTOCK" ? "R" : "C"}
                </span>
                <div>
                  <div className="font-bold text-slate-900">{item.productName}</div>
                  <div className="text-[11px] text-slate-500">
                    {item.notes || (item.entryType === "SALE" ? "Customer Sale" : "Delivery Arrival")}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div
                  className={`font-black ${
                    Number(item.quantityDelta) > 0 ? "text-blue-700" : "text-emerald-700"
                  }`}
                >
                  {Number(item.quantityDelta) > 0 ? `+${item.quantityDelta}` : item.quantityDelta}
                </div>
                <div className="text-[10px] text-slate-400">
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
