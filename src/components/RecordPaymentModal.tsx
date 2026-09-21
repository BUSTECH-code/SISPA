"use client";

import React, { useState, useEffect } from "react";
import { useStock } from "@/context/StockContext";
import { CreditCard, X, Check, AlertCircle } from "lucide-react";

export function RecordPaymentModal() {
  const { activeModal, selectedCustomer, customers, closeModal, recordPayment } = useStock();

  const [customerId, setCustomerId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("CASH");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Confirmation State
  const [confirmedPayment, setConfirmedPayment] = useState<{
    customerName: string;
    amountPaid: number;
    method: string;
    remainingDebt: number;
  } | null>(null);

  useEffect(() => {
    if (activeModal === "PAYMENT") {
      if (selectedCustomer) {
        setCustomerId(String(selectedCustomer.id));
        setAmount(selectedCustomer.outstandingBalance > 0 ? String(selectedCustomer.outstandingBalance) : "");
      } else if (customers.length > 0) {
        const debtor = customers.find((c) => c.outstandingBalance > 0) || customers[0];
        setCustomerId(String(debtor.id));
        setAmount(debtor.outstandingBalance > 0 ? String(debtor.outstandingBalance) : "");
      }
      setMethod("CASH");
      setNotes("");
      setErrorMessage(null);
      setConfirmedPayment(null);
    }
  }, [activeModal, selectedCustomer, customers]);

  if (activeModal !== "PAYMENT") return null;

  const currentCustomer = customers.find((c) => c.id === Number(customerId));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setErrorMessage("This payment could not be recorded. Nothing was changed. Please enter an amount greater than 0.");
      return;
    }

    setIsSubmitting(true);
    const success = await recordPayment(Number(customerId), amt, method, notes.trim() || undefined);
    setIsSubmitting(false);

    if (success) {
      const priorDebt = currentCustomer ? currentCustomer.outstandingBalance : 0;
      const newRemaining = Math.max(0, priorDebt - amt);

      setConfirmedPayment({
        customerName: currentCustomer?.name || "Customer",
        amountPaid: amt,
        method,
        remainingDebt: newRemaining,
      });
    } else {
      setErrorMessage("This payment could not be recorded. Nothing was changed. Please check your network connection and try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <CreditCard className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Record Customer Payment</h3>
              <p className="text-xs text-slate-500">Collect & recover customer debt</p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Success Confirmation Card */}
        {confirmedPayment ? (
          <div className="my-5 rounded-3xl bg-linear-to-b from-emerald-50 to-white border border-emerald-200 p-5 space-y-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
                <Check className="h-6 w-6 stroke-[3]" />
              </div>
              <div>
                <h4 className="text-base font-black text-emerald-950">Payment Recovered!</h4>
                <p className="text-xs text-emerald-700">Customer account balance updated.</p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-3.5 border border-emerald-100 divide-y divide-slate-100 text-xs space-y-1.5">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-900">{confirmedPayment.customerName}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Amount Received:</span>
                <span className="font-black text-emerald-700">₦{confirmedPayment.amountPaid.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Payment Method:</span>
                <span className="font-semibold text-slate-800">{confirmedPayment.method}</span>
              </div>
              <div className="flex justify-between py-1 pt-1.5 font-bold">
                <span className="text-slate-800">Remaining Balance Owed:</span>
                <span className={`text-sm font-black ${confirmedPayment.remainingDebt === 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {confirmedPayment.remainingDebt === 0
                    ? "₦0 (Fully Settled)"
                    : `₦${confirmedPayment.remainingDebt.toLocaleString()}`}
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

            {/* Customer select */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Who is paying?
              </label>
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  const c = customers.find((x) => x.id === Number(e.target.value));
                  if (c && c.outstandingBalance > 0) {
                    setAmount(String(c.outstandingBalance));
                  }
                }}
                required
                className="w-full min-h-[46px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — Owes ₦{c.outstandingBalance.toLocaleString()}
                  </option>
                ))}
              </select>
            </div>

            {/* Current Debt Highlight */}
            {currentCustomer && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950 flex items-center justify-between">
                <span>Current Money Owed:</span>
                <span className="text-base font-black text-amber-900">
                  ₦{currentCustomer.outstandingBalance.toLocaleString()}
                </span>
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Amount Paid (₦) *
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="1"
                required
                placeholder="e.g. 50000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full min-h-[50px] rounded-xl border border-slate-300 px-4 py-2 text-xl font-black text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Payment Method</label>
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

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Optional note
              </label>
              <input
                type="text"
                placeholder="e.g. Bank transfer reference #8392"
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
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-base font-bold text-white shadow-md shadow-emerald-600/30 hover:bg-emerald-700 active:scale-98 transition-all disabled:opacity-50"
              >
                <CreditCard className="h-5 w-5" />
                <span>{isSubmitting ? "Saving payment..." : "Confirm Payment Recovered"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
