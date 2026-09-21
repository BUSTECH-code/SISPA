"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import { History, X, Check, AlertCircle, RotateCcw } from "lucide-react";

export function SaleCorrectionModal() {
  const { activeModal, closeModal, recordSaleCorrection, activities } = useStock();

  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [correctedQuantityDelta, setCorrectedQuantityDelta] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (activeModal !== "SALE_CORRECTION") return null;

  const saleActivities = activities.filter((a) => a.entryType === "SALE");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const saleId = Number(selectedSaleId);
    if (!saleId) {
      setErrorMessage("Please select which sale requires a correction.");
      return;
    }

    const delta = Number(correctedQuantityDelta);
    if (isNaN(delta) || delta === 0) {
      setErrorMessage("Enter a non-zero correction quantity (e.g. +2 for customer return).");
      return;
    }

    if (!correctionReason.trim()) {
      setErrorMessage("Please enter an explanation reason for this correction.");
      return;
    }

    setIsSubmitting(true);
    const success = await recordSaleCorrection(saleId, delta, correctionReason.trim());
    setIsSubmitting(false);

    if (success) {
      setSuccessMessage("Correction recorded! Original transaction preserved in audit history.");
      setTimeout(() => {
        closeModal();
      }, 1500);
    } else {
      setErrorMessage("Failed to record correction.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <RotateCcw className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Record Sale Correction</h3>
              <p className="text-xs text-slate-500">Customer return or entry adjustment</p>
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

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <strong>Immutable History:</strong> SISPA never erases or overwrites past transactions. Corrections are recorded as new linked events so you can always trust your business history.
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Select past sale to correct *
              </label>
              <select
                value={selectedSaleId}
                onChange={(e) => setSelectedSaleId(e.target.value)}
                required
                className="w-full min-h-[46px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
              >
                <option value="">Choose past sale event...</option>
                {saleActivities.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.productName} ({s.quantityDelta} {s.productUnit}) — {new Date(s.createdAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Stock Adjustment Delta *
              </label>
              <input
                type="number"
                step="any"
                required
                placeholder="e.g. +2 (if 2 bags were returned)"
                value={correctedQuantityDelta}
                onChange={(e) => setCorrectedQuantityDelta(e.target.value)}
                className="w-full min-h-[46px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
              />
              <span className="text-[10px] text-slate-500">
                Use positive (e.g. +2) if stock was returned to shop; negative if more goods left.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason for Correction *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Customer brought back 2 intact bags of cement"
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                className="w-full min-h-[46px] rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 text-sm font-bold text-white shadow-md shadow-amber-600/30 hover:bg-amber-700 active:scale-98 transition-all disabled:opacity-50"
              >
                <span>{isSubmitting ? "Saving..." : "Record Sale Correction"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
