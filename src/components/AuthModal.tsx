"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import { Store, User, Lock, Mail, ArrowRight, X, AlertCircle, Building2 } from "lucide-react";

export function AuthModal() {
  const { activeModal, closeModal, login, signup } = useStock();
  const [mode, setMode] = useState<"LOGIN" | "SIGNUP">("LOGIN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (activeModal !== "AUTH") return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (mode === "LOGIN") {
      const res = await login(email, password);
      if (!res.success) {
        setError(res.error || "Invalid email or password.");
      }
    } else {
      const res = await signup({
        email,
        password,
        fullName,
        businessName: businessName || "My Building Materials Shop",
      });
      if (!res.success) {
        setError(res.error || "Failed to create account.");
      }
    }

    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {mode === "LOGIN" ? "Sign In to Shop" : "Open Your Shop Account"}
              </h3>
              <p className="text-xs text-slate-500">
                SISPA 1.0 Smart Stock & Buying Assistant
              </p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-800 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {mode === "SIGNUP" && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Your Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alhaji Musa"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 pl-9 pr-3 text-xs font-medium text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Shop / Business Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="e.g. Musa Building Materials Ltd"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 pl-9 pr-3 text-xs font-medium text-slate-900"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="email"
                required
                placeholder="e.g. owner@buildingmaterials.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 pl-9 pr-3 text-xs font-medium text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 pl-9 pr-3 text-xs font-medium text-slate-900"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 text-sm font-bold text-white shadow-md shadow-amber-600/30 hover:bg-amber-700 active:scale-98 transition-all disabled:opacity-50"
            >
              <span>
                {isSubmitting
                  ? "Please wait..."
                  : mode === "LOGIN"
                  ? "Sign In"
                  : "Create Account & Start"}
              </span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Toggle mode */}
        <div className="mt-4 border-t border-slate-100 pt-3 text-center text-xs text-slate-500">
          {mode === "LOGIN" ? (
            <p>
              New shop owner?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("SIGNUP");
                  setError(null);
                }}
                className="font-bold text-amber-700 hover:underline"
              >
                Create an account
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("LOGIN");
                  setError(null);
                }}
                className="font-bold text-amber-700 hover:underline"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
