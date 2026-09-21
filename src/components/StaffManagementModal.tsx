"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import { Users, X, Check, ShieldCheck, Lock, UserPlus, AlertCircle } from "lucide-react";

export function StaffManagementModal() {
  const { activeModal, closeModal, staffMembers, createStaffUser } = useStock();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (activeModal !== "STAFF_MANAGEMENT") return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!fullName.trim() || !email.trim() || !password) {
      setErrorMessage("Please fill in all fields.");
      return;
    }

    setIsSubmitting(true);
    const res = await createStaffUser(fullName.trim(), email.trim(), password);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMessage(`Created staff account for ${fullName}! They can now log in.`);
      setFullName("");
      setEmail("");
      setPassword("");
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      setErrorMessage(res.error || "Failed to create staff account.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-800">
              <Users className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Staff Accounts & Roles</h3>
              <p className="text-xs text-slate-500">Shop operator permissions & multi-user access</p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Commercial Sensitivity Explanation Banner */}
        <div className="mt-4 rounded-2xl border border-purple-200 bg-purple-50/60 p-3.5 text-xs text-purple-950 space-y-1.5">
          <div className="font-bold flex items-center gap-1.5 text-purple-900">
            <Lock className="h-4 w-4" />
            <span>Commercial Sensitivity Protection:</span>
          </div>
          <p className="leading-relaxed">
            Staff members can record sales, receive shipments, record payments, and count physical stock on their phones.
            Supplier purchase prices, profit margins, cost of goods, and total business expenditures are strictly hidden from staff accounts server-side.
          </p>
        </div>

        {/* Existing staff list */}
        <div className="mt-4 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Current Staff ({staffMembers.length})
          </h4>

          {staffMembers.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
              No staff accounts created yet. You can add one below.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-2xs">
              {staffMembers.map((s) => (
                <div key={s.id} className="p-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{s.fullName}</span>
                    <div className="text-[11px] text-slate-500">{s.email}</div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                    Staff Operator
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add staff form */}
        <form onSubmit={handleSubmit} className="mt-5 border-t border-slate-100 pt-4 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <UserPlus className="h-4 w-4 text-purple-700" />
            <span>Add New Staff Member</span>
          </h4>

          {errorMessage && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-800 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-2.5 text-xs text-emerald-800 border border-emerald-200">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Staff Full Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Musa Aminu"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Staff Login Email *</label>
              <input
                type="email"
                required
                placeholder="e.g. musa@shop.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Password *</label>
              <input
                type="password"
                required
                placeholder="At least 6 chars"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-purple-800 disabled:opacity-50 transition-all"
            >
              <UserPlus className="h-4 w-4" />
              <span>{isSubmitting ? "Creating..." : "Create Staff Account"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
