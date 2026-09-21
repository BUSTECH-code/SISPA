"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import { Receipt, X, Check, AlertCircle } from "lucide-react";

export function RecordExpenseModal() {
  const { activeModal, closeModal, recordShopExpense } = useStock();

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Shop Operations");
  const [method, setMethod] = useState("CASH");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (activeModal !== "EXPENSE") return null;

  const categories = [
    "Shop Operations",
    "Transport & Logistics",
    "Repairs & Maintenance",
    "Utilities & Fuel",
    "Staff Welfare",
    "Other",
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const amt = Number(amount);
    if (!title.trim()) {
      setErrorMessage("Please enter what this money was spent on.");
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      setErrorMessage("Enter an amount greater than 0.");
      return;
    }

    setIsSubmitting(true);
    const success = await recordShopExpense(
      title.trim(),
      amt,
      category,
      method,
      notes.trim() || undefined
    );
    setIsSubmitting(false);

    if (success) {
      setSuccessMessage(`Recorded ₦${amt.toLocaleString()} spent on ${title}!`);
      setTimeout(() => {
        closeModal();
      }, 1200);
    } else {
      setErrorMessage("Failed to record expense. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-800">
              <Receipt className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Record Shop Expense</h3>
              <p className="text-xs text-slate-500">Money spent running your shop</p>
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
            <p className="font-bold text-emerald-900">{successMessage}</p>
            <p className="text-xs text-emerald-700 mt-0.5">Weekly report and profit calculations updated.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-800 border border-red-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* What was it for */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                What was the money spent on? *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Generator diesel fuel, offloading labor..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full min-h-[46px] rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-900 focus:border-amber-600"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Amount Spent (₦) *
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="1"
                required
                placeholder="e.g. 25000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full min-h-[50px] rounded-xl border border-slate-300 px-4 py-2 text-xl font-black text-slate-900 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Paid With</label>
              <div className="grid grid-cols-3 gap-2">
                {["CASH", "TRANSFER", "POS"].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`min-h-[40px] rounded-xl text-xs font-bold border transition-colors ${
                      method === m
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Note */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Optional note
              </label>
              <input
                type="text"
                placeholder="e.g. 50 liters bought at Total filling station"
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
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 px-4 text-base font-bold text-white shadow-md shadow-orange-600/30 hover:bg-orange-700 active:scale-98 transition-all disabled:opacity-50"
              >
                <Receipt className="h-5 w-5" />
                <span>{isSubmitting ? "Saving expense..." : "Save Shop Expense"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
