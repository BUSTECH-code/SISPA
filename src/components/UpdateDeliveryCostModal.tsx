"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import { DollarSign, X, Check, AlertCircle, Lock } from "lucide-react";

export function UpdateDeliveryCostModal() {
  const { activeModal, selectedLedgerEntry, closeModal, updateDeliveryCost } = useStock();

  const [unitCost, setUnitCost] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (activeModal !== "UPDATE_COST" || !selectedLedgerEntry) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const costNum = Number(unitCost);
    if (isNaN(costNum) || costNum <= 0) {
      setErrorMessage("Enter a unit purchase cost greater than 0.");
      return;
    }

    setIsSubmitting(true);
    const success = await updateDeliveryCost(selectedLedgerEntry.id, costNum);
    setIsSubmitting(false);

    if (success) {
      setSuccessMessage(`Purchase price of ₦${costNum.toLocaleString()} recorded! COGS and net profit updated.`);
      setTimeout(() => {
        closeModal();
      }, 1500);
    } else {
      setErrorMessage("Failed to update purchase cost.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <DollarSign className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Record Purchase Price</h3>
              <p className="text-xs text-slate-500">Commercial cost for delivery #{selectedLedgerEntry.id}</p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Success Banner */}
        {successMessage ? (
          <div className="my-6 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white mb-2">
              <Check className="h-6 w-6 stroke-[3]" />
            </div>
            <p className="font-bold text-emerald-900 text-sm">{successMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-800 border border-red-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <span className="font-bold text-slate-900">{selectedLedgerEntry.productName}</span>
              <div>Quantity received: +{selectedLedgerEntry.quantityDelta} {selectedLedgerEntry.productUnit}</div>
              {selectedLedgerEntry.supplierName && (
                <div>Supplier: {selectedLedgerEntry.supplierName}</div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Actual Purchase Price Paid for One (₦) *
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="1"
                required
                autoFocus
                placeholder="e.g. 8500"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="w-full min-h-[50px] rounded-xl border border-slate-300 px-4 py-2 text-xl font-black text-slate-900 focus:border-amber-600"
              />
              <span className="text-[10px] text-slate-500">
                Confidential to shop owner. Unlocks accurate Cost of Goods Sold & profit calculations.
              </span>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 text-sm font-bold text-white shadow-md shadow-amber-600/30 hover:bg-amber-700 active:scale-98 transition-all disabled:opacity-50"
              >
                <span>{isSubmitting ? "Saving..." : "Save Purchase Price"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
