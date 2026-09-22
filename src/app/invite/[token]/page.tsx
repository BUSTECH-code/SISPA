"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ShieldCheck, Check, AlertCircle, Lock, ArrowRight, Store } from "lucide-react";

export default function InviteAcceptancePage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [isLoading, setIsLoading] = useState(true);
  const [invitationData, setInvitationData] = useState<{
    businessName: string;
    inviteeName: string;
    inviteeEmail: string | null;
    role: string;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    async function verify() {
      if (!token) return;
      try {
        const res = await fetch(`/api/auth/invitation/${token}`);
        const json = await res.json();
        if (json.success && json.data) {
          setInvitationData(json.data);
          setFullName(json.data.inviteeName || "");
          setEmail(json.data.inviteeEmail || "");
        } else {
          setValidationError(json.error || "Invalid or expired invitation link.");
        }
      } catch {
        setValidationError("Could not verify invitation link. Please check your internet connection.");
      } finally {
        setIsLoading(false);
      }
    }
    verify();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (password.length < 6) {
      setSubmitError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    if (!email.includes("@")) {
      setSubmitError("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/auth/invitation/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setIsSuccess(true);
        setTimeout(() => {
          router.push("/");
        }, 1500);
      } else {
        setSubmitError(json.error || "Failed to activate your account.");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-purple-700 border-t-transparent" />
          <p className="text-xs font-semibold text-slate-600">Verifying invitation link...</p>
        </div>
      </div>
    );
  }

  if (validationError || !invitationData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-xl border border-slate-200 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Invitation Link Invalid</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            {validationError || "This invitation link has expired or has already been used."}
          </p>
          <div className="pt-2">
            <button
              onClick={() => router.push("/")}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-xs font-bold text-white hover:bg-slate-800 transition-all"
            >
              Go to Home Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-xl border border-slate-200 space-y-5">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
            <Store className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Join {invitationData.businessName}</h1>
          <p className="text-xs text-slate-500">
            You have been invited as a Staff Operator on SISPA
          </p>
        </div>

        {/* Success screen */}
        {isSuccess ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="h-6 w-6 stroke-[3]" />
            </div>
            <h3 className="text-sm font-bold text-emerald-950">Account Activated!</h3>
            <p className="text-xs text-emerald-800">
              Welcome to the team. Taking you to your shop dashboard now...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {submitError && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-800 border border-red-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{submitError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Your Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Your Login Email</label>
              <input
                type="email"
                required
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Choose Password</label>
              <input
                type="password"
                required
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Confirm Password</label>
              <input
                type="password"
                required
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-purple-800 disabled:opacity-50 transition-all"
            >
              <span>{isSubmitting ? "Activating..." : "Accept Invitation & Activate"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
