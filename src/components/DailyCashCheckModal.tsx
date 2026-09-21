"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import { Calculator, X, Check, AlertCircle, Info, ArrowRight } from "lucide-react";

export function DailyCashCheckModal() {
  const { activeModal, closeModal, recordDailyCashCheck, weeklyReport } = useStock();

  const [actualCash, setActualCash] = useState("");
  const [notes, setNotes] = useState("");
  const [checkDate, setCheckDate] = useState(new Date().toISOString().split("T")[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (activeModal !== "CASH_CHECK") return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const actual = Number(actualCash);
    if (isNaN(actual) || actual < 0) {
      setErrorMessage("Enter a valid actual cash amount in your shop drawer/bank.");
      return;
    }

    setIsSubmitting(true);
    const res = await recordDailyCashCheck(actual, notes.trim() || undefined, checkDate);
    setIsSubmitting(false);

    if (res.success) {
      setResultMessage(res.message || "Daily cash check recorded!");
      setTimeout(() => {
        closeModal();
      }, 2500);
    } else {
      setErrorMessage(res.error || "Failed to record cash check.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-800">
              <Calculator className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Daily Business Cash Check</h3>
              <p className="text-xs text-slate-500">End-of-day money reconciliation</p>
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
        {resultMessage ? (
          <div className="my-6 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white mb-2">
              <Check className="h-6 w-6 stroke-[3]" />
            </div>
            <p className="font-bold text-emerald-900 text-sm">{resultMessage}</p>
            <p className="text-xs text-emerald-700 mt-1">Audit record saved.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-800 border border-red-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 space-y-1.5">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-purple-700" />
                <span>How Cash Check Works:</span>
              </div>
              <p>
                Count the actual money in your drawer or received via bank transfer today. SISPA will compare it with recorded cash sales, customer debt payments, and expenses to identify any unrecorded difference.
              </p>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Check Date</label>
              <input
                type="date"
                required
                value={checkDate}
                onChange={(e) => setCheckDate(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900"
              />
            </div>

            {/* Actual cash counted */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Actual Cash Counted Today (₦) *
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                required
                placeholder="e.g. 620000"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                className="w-full min-h-[50px] rounded-xl border border-slate-300 px-4 py-2 text-xl font-black text-slate-900 focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
              />
            </div>

            {/* Optional note */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Optional note (e.g. Cashier on duty, drawer count)
              </label>
              <input
                type="text"
                placeholder="e.g. End of shift cash count by shop owner"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800"
              />
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-base font-bold text-white shadow-md shadow-purple-700/30 hover:bg-purple-800 active:scale-98 transition-all disabled:opacity-50"
              >
                <Calculator className="h-5 w-5" />
                <span>{isSubmitting ? "Checking..." : "Confirm & Check Cash"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
