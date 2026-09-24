"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import { Shield, Key, Clock, CheckCircle2, AlertCircle, X, Headphones } from "lucide-react";

interface OwnerSupportRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OwnerSupportRequestModal({ isOpen, onClose }: OwnerSupportRequestModalProps) {
  const { user } = useStock();
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<
    "ACCOUNT_WHATSAPP" | "CATALOG_DIAGNOSTICS" | "DEBT_RECONCILIATION" | "SYSTEM_CONFIG" | "READ_ONLY"
  >("ACCOUNT_WHATSAPP");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMessage("Please describe the specific issue requiring platform assistance.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/support/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          scope,
          requestedDurationMinutes: durationMinutes,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSuccessMessage("Support request submitted successfully. A SISPA Platform Administrator will review and authorize your session shortly.");
        setReason("");
        setTimeout(() => {
          onClose();
          setSuccessMessage(null);
        }, 2500);
      } else {
        setErrorMessage(json.error || "Failed to submit support request.");
      }
    } catch {
      setErrorMessage("Network error communicating with SISPA platform.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-slate-950 font-black shadow-xs">
              <Headphones className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">Request Platform Support</h3>
              <p className="text-xs text-slate-500">
                Controlled, scoped & time-bound assistance authorization
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Security Notice */}
        <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-200/80 p-3.5 text-xs text-amber-900">
          <div className="flex items-start gap-2.5">
            <Shield className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
            <div>
              <span className="font-bold">Zero Casual Access Guarantee: </span>
              SISPA Platform Administrators cannot view your store without your explicit authorization. 
              Submitting this request creates an auditable ticket with the exact scope and duration you approve.
            </div>
          </div>
        </div>

        {successMessage && (
          <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-xs font-semibold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-2xl bg-red-50 border border-red-200 p-4 text-xs font-semibold text-red-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Issue Description / Technical Assistance Needed *
            </label>
            <textarea
              required
              rows={3}
              placeholder="e.g. WhatsApp notification webhook is not sending daily stock alerts to my phone number."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Requested Access Scope
              </label>
              <select
                value={scope}
                onChange={(e: any) => setScope(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-900 bg-white"
              >
                <option value="ACCOUNT_WHATSAPP">Account & WhatsApp Linking</option>
                <option value="CATALOG_DIAGNOSTICS">Catalog & Stock Diagnostics</option>
                <option value="DEBT_RECONCILIATION">Debt & Ledger Verification</option>
                <option value="SYSTEM_CONFIG">System Configuration</option>
                <option value="READ_ONLY">Read-Only Audit</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Authorized Duration
              </label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-900 bg-white"
              >
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes (Recommended)</option>
                <option value={60}>1 Hour</option>
                <option value={120}>2 Hours</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600 border border-slate-200">
            <span className="font-semibold text-slate-800">Support Access Lifecycle:</span> If approved by a Platform Administrator, scoped access will automatically expire after {durationMinutes} minutes. You can also revoke access anytime from your audit trail.
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason.trim()}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSubmitting ? "Submitting Request..." : "Submit Support Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
