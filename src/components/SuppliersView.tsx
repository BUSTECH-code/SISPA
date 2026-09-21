"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import {
  Truck,
  Search,
  Calendar,
  DollarSign,
  Package,
  Lock,
  ArrowRight,
  ShieldCheck,
  Building,
} from "lucide-react";

export function SuppliersView() {
  const { suppliers, isOwner, openRecordDelivery, setActiveTab } = useStock();
  const [search, setSearch] = useState("");

  const filtered = suppliers.filter((s) => {
    const matchesSearch =
      s.supplierName.toLowerCase().includes(search.toLowerCase()) ||
      s.productsSupplied.some((p) => p.toLowerCase().includes(search.toLowerCase()));
    return matchesSearch;
  });

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Suppliers & Purchase History
            </h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
              {suppliers.length} vendors
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Real historical records of who you bought from, what was delivered, and prices actually paid.
          </p>
        </div>

        <button
          onClick={() => openRecordDelivery()}
          className="flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all self-start sm:self-auto"
        >
          <Truck className="h-4 w-4" />
          <span>Record New Delivery</span>
        </button>
      </div>

      {/* Commercial Reality Notice */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Building className="h-4 w-4 text-emerald-600" />
            <span>Actual Historical Facts, Not Speculative Price Intelligence</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Building-material prices change and are negotiated based on quantity and supplier terms.
            SISPA records what your business actually paid for past shipments rather than pretending there is one universal market price.
          </p>
        </div>

        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-3.5 text-xs text-purple-950 flex flex-col justify-center">
          <div className="font-bold flex items-center gap-1 text-purple-900">
            <Lock className="h-3.5 w-3.5" />
            <span>Commercial Sensitivity</span>
          </div>
          <p className="mt-1 text-[11px] text-purple-800">
            {isOwner
              ? "As shop owner, supplier pricing history and unit costs are fully visible to you."
              : "Supplier purchase costs are confidential and restricted to the shop owner."}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search suppliers by name or products supplied (e.g. Dangote, Tower, cement)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full min-h-[46px] rounded-2xl border border-slate-300 bg-white pl-10 pr-4 text-sm font-medium text-slate-900 focus:border-emerald-600"
        />
      </div>

      {/* Suppliers Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <Truck className="mx-auto h-8 w-8 text-slate-400 mb-2" />
          <h3 className="text-sm font-bold text-slate-800">No supplier records found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Suppliers are automatically tracked whenever you or your staff record goods received from deliveries.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((s) => (
            <div
              key={s.supplierName}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs hover:border-emerald-300 transition-colors space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{s.supplierName}</h3>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.productsSupplied.map((p) => (
                      <span key={p} className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>

                <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  {s.deliveriesCount} shipments
                </span>
              </div>

              {/* Purchase history table */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Recent Recorded Shipments:
                </span>

                <div className="divide-y divide-slate-100 text-xs">
                  {s.previousPrices.map((item, idx) => (
                    <div key={idx} className="py-1.5 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-slate-800">{item.productName}</span>
                        <div className="text-[10px] text-slate-400">
                          {new Date(item.date).toLocaleDateString()} • Qty: +{item.quantity}
                        </div>
                      </div>

                      <div className="text-right">
                        {isOwner ? (
                          item.unitCost ? (
                            <span className="font-bold text-emerald-800">
                              ₦{item.unitCost.toLocaleString()} each
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-700 italic">No price logged</span>
                          )
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Confidential</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action */}
              <div className="pt-1 flex items-center justify-between text-xs">
                <span className="text-slate-400 text-[11px]">
                  Last delivery: {s.lastDeliveryDate ? new Date(s.lastDeliveryDate).toLocaleDateString() : "None"}
                </span>

                <button
                  onClick={() => openRecordDelivery()}
                  className="font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
                >
                  <span>Record Arrival</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
