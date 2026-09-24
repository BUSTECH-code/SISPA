"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import {
  FileText,
  Receipt,
  Building,
  Calculator,
  Users,
  RotateCcw,
  MessageSquare,
  Download,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  UserCheck,
  Building2,
  Clock,
  Headphones,
} from "lucide-react";
import { OwnerSupportRequestModal } from "./OwnerSupportRequestModal";

export function OwnerMoreView() {
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const {
    user,
    setActiveTab,
    openCashCheck,
    openStaffManagement,
    openSaleCorrection,
    exportBusinessBackup,
    staffMembers,
    staffInvitations,
    expenses,
    suppliers,
    dailyCashChecks,
  } = useStock();

  const activeStaffCount = staffMembers.filter((s) => s.status === "ACTIVE").length;
  const pendingInvitesCount = staffInvitations.filter((i) => i.status === "PENDING").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24 pt-2">
      {/* Header */}
      <div className="border-b border-slate-200/80 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-900 shadow-xs">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Business Tools & Settings
            </h1>
            <p className="text-xs text-slate-500">
              {user?.businessName || "Musa Building Materials Ltd"} • Owner Controls
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 1: BUSINESS OPERATIONS & FINANCE */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 px-1">
          Business Operations & Finance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Performance Reports */}
          <button
            onClick={() => setActiveTab("REPORTS")}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-amber-300 hover:bg-amber-50/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Performance Reports</h3>
                <p className="text-xs text-slate-500">Sales revenue, gross profit & margins</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-600 group-hover:translate-x-1 group-hover:text-slate-900 transition-all" />
          </button>

          {/* Shop Expenses */}
          <button
            onClick={() => setActiveTab("EXPENSES")}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-amber-300 hover:bg-amber-50/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
                <Receipt className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-slate-900">Shop Expenses</h3>
                  {expenses.length > 0 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {expenses.length}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">Transport, generator fuel, shop outlays</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-600 group-hover:translate-x-1 group-hover:text-slate-900 transition-all" />
          </button>

          {/* Suppliers & Price History */}
          <button
            onClick={() => setActiveTab("SUPPLIERS")}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-amber-300 hover:bg-amber-50/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Building className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-slate-900">Suppliers & Deliveries</h3>
                  {suppliers.length > 0 && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      {suppliers.length}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">Past delivery costs & vendor history</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-600 group-hover:translate-x-1 group-hover:text-slate-900 transition-all" />
          </button>

          {/* Daily Cash Reconciliation */}
          <button
            onClick={openCashCheck}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-amber-300 hover:bg-amber-50/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
                <Calculator className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-slate-900">Check Today&apos;s Money</h3>
                  {dailyCashChecks.length > 0 && (
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">Reconcile cash drawer against recorded sales</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-600 group-hover:translate-x-1 group-hover:text-slate-900 transition-all" />
          </button>
        </div>
      </div>

      {/* SECTION 2: TEAM & GOVERNANCE */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 px-1">
          Team & Governance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Staff Management */}
          <button
            onClick={openStaffManagement}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-amber-300 hover:bg-amber-50/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-slate-900">Staff Management</h3>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                    {activeStaffCount} Active
                  </span>
                  {pendingInvitesCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      {pendingInvitesCount} Pending
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">Add shop staff, generate invite links & status</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-600 group-hover:translate-x-1 group-hover:text-slate-900 transition-all" />
          </button>

          {/* Sale Correction */}
          <button
            onClick={openSaleCorrection}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-amber-300 hover:bg-amber-50/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Sale Correction</h3>
                <p className="text-xs text-slate-500">Adjust counter mistakes with audit notes</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-600 group-hover:translate-x-1 group-hover:text-slate-900 transition-all" />
          </button>

          {/* Activity Log */}
          <button
            onClick={() => setActiveTab("ACTIVITY")}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-amber-300 hover:bg-amber-50/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Verified Activity Log</h3>
                <p className="text-xs text-slate-500">Timestamped record of all sales & deliveries</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-600 group-hover:translate-x-1 group-hover:text-slate-900 transition-all" />
          </button>
        </div>
      </div>

      {/* SECTION 3: BUSINESS TOOLS & BACKUP */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 px-1">
          Business Tools & Backup
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* WhatsApp Assistant */}
          <button
            onClick={() => setActiveTab("WHATSAPP")}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-emerald-300 hover:bg-emerald-50/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <MessageSquare className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">WhatsApp Assistant</h3>
                <p className="text-xs text-slate-500">Shop briefings, morning summary & stock alerts</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-600 group-hover:translate-x-1 group-hover:text-slate-900 transition-all" />
          </button>

          {/* Data Export / Backup */}
          <button
            onClick={exportBusinessBackup}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-amber-300 hover:bg-amber-50/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Download className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Download Business Backup</h3>
                <p className="text-xs text-slate-500">Export products, sales & ledger records (JSON)</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-600 group-hover:translate-x-1 group-hover:text-slate-900 transition-all" />
          </button>

          {/* Request Platform Support */}
          <button
            onClick={() => setSupportModalOpen(true)}
            className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/40 p-4 text-left shadow-2xs hover:border-amber-400 hover:bg-amber-50 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500 text-slate-950 font-black">
                <Headphones className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Request Platform Support</h3>
                <p className="text-xs text-slate-600">Authorize temporary, scoped technical assistance</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-amber-700 group-hover:translate-x-1 transition-all" />
          </button>
        </div>
      </div>

      <OwnerSupportRequestModal
        isOpen={supportModalOpen}
        onClose={() => setSupportModalOpen(false)}
      />
    </div>
  );
}
