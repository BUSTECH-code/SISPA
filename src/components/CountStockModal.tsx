"use client";

import React, { useState, useEffect } from "react";
import { useStock } from "@/context/StockContext";
import { Scale, X, Check, AlertCircle, ArrowRight } from "lucide-react";

export function CountStockModal() {
  const { activeModal, selectedProduct, products, closeModal, refreshData } = useStock();

  const [productId, setProductId] = useState<number | string>("");
  const [physicalCount, setPhysicalCount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Confirmation State
  const [confirmedCount, setConfirmedCount] = useState<{
    productName: string;
    unit: string;
    counted: number;
    difference: number;
  } | null>(null);

  useEffect(() => {
    if (activeModal === "COUNT") {
      if (selectedProduct) {
        setProductId(selectedProduct.id);
      } else if (products.length > 0) {
        setProductId(products[0].id);
      }
      setPhysicalCount("");
      setNotes("");
      setErrorMessage(null);
      setConfirmedCount(null);
    }
  }, [activeModal, selectedProduct, products]);

  if (activeModal !== "COUNT") return null;

  const currentProduct = products.find((p) => p.id === Number(productId));
  const currentSystemStock = currentProduct ? currentProduct.currentStock : 0;
  const countNumber = physicalCount !== "" && !isNaN(Number(physicalCount)) ? Number(physicalCount) : null;
  const difference = countNumber !== null ? countNumber - currentSystemStock : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (countNumber === null || countNumber < 0) {
      setErrorMessage("This stock count could not be recorded. Nothing was changed. Please enter 0 or a positive number.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/stock-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: Number(productId),
          physicalCount: countNumber,
          notes: notes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrorMessage(json.error || "This stock count could not be recorded. Nothing was changed. Please check your network connection and try again.");
      } else {
        setConfirmedCount({
          productName: currentProduct?.name || "Product",
          unit: currentProduct?.unit || "units",
          counted: countNumber,
          difference: difference || 0,
        });

        await refreshData();
      }
    } catch {
      setErrorMessage("This stock count could not be recorded. Nothing was changed. Please check your network connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <Scale className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Count Stock</h3>
              <p className="text-xs text-slate-500">Match physical goods in shop</p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Confirmation Card */}
        {confirmedCount ? (
          <div className="my-5 rounded-3xl bg-linear-to-b from-emerald-50 to-white border border-emerald-200 p-5 space-y-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
                <Check className="h-6 w-6 stroke-[3]" />
              </div>
              <div>
                <h4 className="text-base font-black text-emerald-950">Stock Count Confirmed!</h4>
                <p className="text-xs text-emerald-700">Stock updated to match your physical count.</p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-3.5 border border-emerald-100 divide-y divide-slate-100 text-xs space-y-1.5">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Product Counted:</span>
                <span className="font-bold text-slate-900">{confirmedCount.productName}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Physical Count Found:</span>
                <span className="font-black text-slate-900 text-sm">{confirmedCount.counted} {confirmedCount.unit}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Adjustment Recorded:</span>
                <span className="font-bold text-slate-800">
                  {confirmedCount.difference === 0
                    ? "None (Matched perfectly)"
                    : confirmedCount.difference > 0
                    ? `+${confirmedCount.difference} ${confirmedCount.unit} more`
                    : `${Math.abs(confirmedCount.difference)} ${confirmedCount.unit} fewer`}
                </span>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={closeModal}
                className="flex-1 min-h-[46px] rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 active:scale-98 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-800 border border-red-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Product Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Which product are you counting?
              </label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                required
                className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Current System Display: "System says: 42 bags" */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
              <div className="text-xs text-slate-500 font-medium">System currently says:</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-900">
                  {currentSystemStock}
                </span>
                <span className="text-sm font-bold text-slate-600">{currentProduct?.unit || "units"}</span>
              </div>
            </div>

            {/* User Input: "How many are actually here?" */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                How many are actually here in your shop?
              </label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  required
                  placeholder="e.g. 35"
                  value={physicalCount}
                  onChange={(e) => setPhysicalCount(e.target.value)}
                  className="w-full min-h-[52px] rounded-xl border border-slate-300 px-4 py-2 text-xl font-black text-slate-900 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  {currentProduct?.unit || "units"}
                </span>
              </div>
            </div>

            {/* Difference & Explanation Card */}
            {difference !== null && (
              <div
                className={`rounded-2xl p-4 border transition-all ${
                  difference === 0
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : difference > 0
                    ? "bg-blue-50 border-blue-200 text-blue-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span>Difference:</span>
                  <span className="text-lg">
                    {difference === 0
                      ? "Matches perfectly"
                      : difference > 0
                      ? `+${difference} ${currentProduct?.unit || "units"} more`
                      : `${Math.abs(difference)} ${currentProduct?.unit || "units"} fewer`}
                  </span>
                </div>
                <p className="mt-1 text-xs opacity-90">
                  {difference === 0
                    ? "Physical count matches system stock perfectly!"
                    : "We'll update the stock to match your count."}
                </p>
              </div>
            )}

            {/* Optional note */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Optional note
              </label>
              <input
                type="text"
                placeholder="e.g. Weekly shop floor physical count"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || countNumber === null}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 text-base font-bold text-white shadow-md shadow-amber-600/30 hover:bg-amber-700 active:scale-98 transition-all disabled:opacity-50"
              >
                <Scale className="h-5 w-5" />
                <span>{isSubmitting ? "Updating stock..." : "Update Stock"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
