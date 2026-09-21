"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import { CheckSquare, X, Check, ArrowRight, AlertTriangle, Scale } from "lucide-react";

export function StockCheckModal() {
  const { activeModal, products, closeModal, refreshData } = useStock();
  const [counts, setCounts] = useState<{ [productId: number]: string }>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedItems, setCompletedItems] = useState<number[]>([]);

  if (activeModal !== "STOCK_CHECK") return null;

  const currentProduct = products[currentIndex];

  const handleRecordCurrent = async () => {
    if (!currentProduct) return;
    const inputVal = counts[currentProduct.id];
    if (inputVal === undefined || inputVal === "") return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/stock-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: currentProduct.id,
          physicalCount: Number(inputVal),
          notes: "Weekly shop stock check",
        }),
      });

      if (res.ok) {
        setCompletedItems([...completedItems, currentProduct.id]);
        if (currentIndex < products.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          await refreshData();
          closeModal();
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentVal = currentProduct ? counts[currentProduct.id] : "";
  const countNumber = currentVal !== "" && !isNaN(Number(currentVal)) ? Number(currentVal) : null;
  const difference = countNumber !== null && currentProduct ? countNumber - currentProduct.currentStock : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <CheckSquare className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Weekly Stock Check</h3>
              <p className="text-xs text-slate-500">
                Item {currentIndex + 1} of {products.length}
              </p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-amber-600 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / Math.max(1, products.length)) * 100}%` }}
          />
        </div>

        {currentProduct ? (
          <div className="mt-5 space-y-4">
            <div>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {currentProduct.category}
              </span>
              <h4 className="mt-1 text-lg font-black text-slate-900">{currentProduct.name}</h4>
            </div>

            {/* System stock */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">System says:</div>
                <div className="text-2xl font-black text-slate-900">
                  {currentProduct.currentStock} {currentProduct.unit}
                </div>
              </div>
              <div className="text-right text-xs text-slate-500">
                Coverage: {currentProduct.desiredCoverageDays} days
              </div>
            </div>

            {/* Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                How many are actually in the shop?
              </label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  autoFocus
                  placeholder="e.g. 84"
                  value={counts[currentProduct.id] ?? ""}
                  onChange={(e) =>
                    setCounts({ ...counts, [currentProduct.id]: e.target.value })
                  }
                  className="w-full min-h-[52px] rounded-xl border border-slate-300 px-4 py-2 text-xl font-black text-slate-900 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  {currentProduct.unit}
                </span>
              </div>
            </div>

            {/* Difference breakdown */}
            {difference !== null && (
              <div
                className={`rounded-xl p-3 text-xs font-bold ${
                  difference === 0
                    ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                    : difference > 0
                    ? "bg-blue-50 text-blue-900 border border-blue-200"
                    : "bg-amber-50 text-amber-900 border border-amber-200"
                }`}
              >
                {difference === 0 ? (
                  <span>Stock matches system count perfectly!</span>
                ) : (
                  <span>
                    Stock doesn&apos;t match: {Math.abs(difference)} {difference > 0 ? "more" : "fewer"} than recorded. We&apos;ll record an adjustment.
                  </span>
                )}
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (currentIndex < products.length - 1) setCurrentIndex(currentIndex + 1);
                }}
                className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Skip item
              </button>

              <button
                type="button"
                disabled={isSubmitting || countNumber === null}
                onClick={handleRecordCurrent}
                className="flex min-h-[48px] flex-2 items-center justify-center gap-2 rounded-xl bg-amber-600 text-xs sm:text-sm font-bold text-white shadow-md hover:bg-amber-700 disabled:opacity-50"
              >
                <span>{currentIndex === products.length - 1 ? "Save & Finish Check" : "Confirm & Next"}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-500">
            No products found to check.
          </div>
        )}
      </div>
    </div>
  );
}
