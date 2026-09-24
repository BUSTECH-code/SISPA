"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import {
  Users,
  X,
  Check,
  ShieldCheck,
  Lock,
  UserPlus,
  AlertCircle,
  Link as LinkIcon,
  Copy,
  Trash2,
  PauseCircle,
  PlayCircle,
  ArrowRightLeft,
  KeyRound,
  ShieldAlert,
  Sliders,
} from "lucide-react";

export const CAPABILITY_OPTIONS = [
  { key: "CAN_SELL", label: "Sell goods", desc: "Record sales & issue customer receipts" },
  { key: "CAN_RECEIVE", label: "Receive goods", desc: "Tally incoming stock without seeing purchase costs" },
  { key: "CAN_COLLECT", label: "Collect payments", desc: "Receive customer debt payments" },
  { key: "CAN_COUNT", label: "Count stock", desc: "Conduct physical stock-taking counts" },
  { key: "CAN_CHANGE_PRICE", label: "Change selling prices", desc: "Edit product catalog selling prices" },
  { key: "CAN_CORRECT_TRANSACTIONS", label: "Correct sales", desc: "Reverse or correct completed sales transactions" },
];

export function StaffManagementModal() {
  const {
    activeModal,
    closeModal,
    staffMembers,
    staffInvitations,
    createStaffInvitation,
    revokeStaffInvitation,
    updateStaffStatus,
    updateStaffCapabilities,
    transferOwnership,
    createStaffUser,
  } = useStock();

  const [activeTab, setActiveTab] = useState<"INVITE" | "MEMBERS" | "DIRECT" | "TRANSFER">("INVITE");

  // Invitation Form
  const [inviteeName, setInviteeName] = useState("");
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [inviteCapabilities, setInviteCapabilities] = useState<string[]>([
    "CAN_SELL",
    "CAN_RECEIVE",
    "CAN_COLLECT",
    "CAN_COUNT",
  ]);
  const [generatedInvite, setGeneratedInvite] = useState<{ inviteUrl: string; inviteeName: string; expiresAt: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Capability Editor for existing staff member
  const [editingStaffId, setEditingStaffId] = useState<number | null>(null);
  const [editingCaps, setEditingCaps] = useState<string[]>([]);

  // Direct Account Form
  const [directFullName, setDirectFullName] = useState("");
  const [directEmail, setDirectEmail] = useState("");
  const [directPassword, setDirectPassword] = useState("");

  // Transfer Ownership Form
  const [transferTargetUserId, setTransferTargetUserId] = useState<number | "">("");
  const [transferPassword, setTransferPassword] = useState("");
  const [transferReason, setTransferReason] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (activeModal !== "STAFF_MANAGEMENT") return null;

  const toggleInviteCap = (key: string) => {
    setInviteCapabilities((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleEditingCap = (key: string) => {
    setEditingCaps((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Handle Generate Invitation Link
  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!inviteeName.trim()) {
      setErrorMessage("Please enter the staff member's name.");
      return;
    }

    setIsSubmitting(true);
    const res = await createStaffInvitation(
      inviteeName.trim(),
      inviteeEmail.trim() || undefined,
      inviteCapabilities
    );
    setIsSubmitting(false);

    if (res.success && res.data) {
      setGeneratedInvite({
        inviteUrl: res.data.inviteUrl,
        inviteeName: res.data.inviteeName,
        expiresAt: res.data.expiresAt,
      });
      setSuccessMessage(`Invitation link created for ${res.data.inviteeName}!`);
      setInviteeName("");
      setInviteeEmail("");
    } else {
      setErrorMessage(res.error || "Failed to generate invitation.");
    }
  };

  const handleSaveStaffCapabilities = async (staffUserId: number) => {
    setIsSubmitting(true);
    const res = await updateStaffCapabilities(staffUserId, editingCaps);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMessage("Staff capabilities updated successfully!");
      setEditingStaffId(null);
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      setErrorMessage(res.error || "Failed to update capabilities.");
    }
  };

  const handleCopyLink = async () => {
    if (!generatedInvite?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(generatedInvite.inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
    }
  };

  // Handle Direct Staff Creation
  const handleDirectCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!directFullName.trim() || !directEmail.trim() || !directPassword) {
      setErrorMessage("Please fill in all fields.");
      return;
    }

    setIsSubmitting(true);
    const res = await createStaffUser(directFullName.trim(), directEmail.trim(), directPassword);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMessage(`Created staff account for ${directFullName}!`);
      setDirectFullName("");
      setDirectEmail("");
      setDirectPassword("");
    } else {
      setErrorMessage(res.error || "Failed to create staff account.");
    }
  };

  // Handle Lifecycle Status Change (Suspend / Activate / Deactivate)
  const handleStatusChange = async (
    staffUserId: number,
    newStatus: "ACTIVE" | "SUSPENDED" | "DEACTIVATED",
    name: string
  ) => {
    const actionLabel =
      newStatus === "SUSPENDED" ? "suspend" : newStatus === "DEACTIVATED" ? "deactivate" : "reactivate";

    if (!confirm(`Are you sure you want to ${actionLabel} ${name}?`)) {
      return;
    }

    setIsSubmitting(true);
    const res = await updateStaffStatus(staffUserId, newStatus);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMessage(`Staff member ${name} is now ${newStatus.toLowerCase()}.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      setErrorMessage(res.error || "Failed to update staff status.");
    }
  };

  // Handle Revoke Invitation
  const handleRevokeInvite = async (invitationId: number) => {
    if (!confirm("Revoke this invitation link? It will no longer be usable.")) {
      return;
    }
    const ok = await revokeStaffInvitation(invitationId);
    if (ok) {
      setSuccessMessage("Invitation revoked.");
      setTimeout(() => setSuccessMessage(null), 2500);
    }
  };

  // Handle Transfer Ownership
  const handleTransferOwnership = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!transferTargetUserId || !transferPassword) {
      setErrorMessage("Please select a successor and enter your current password.");
      return;
    }

    if (
      !confirm(
        "WARNING: You are transferring full ownership of this business. You will become a staff operator. Continue?"
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    const res = await transferOwnership(Number(transferTargetUserId), transferPassword, transferReason);
    setIsSubmitting(false);

    if (res.success) {
      alert("Business ownership successfully transferred! The page will now reload.");
      window.location.reload();
    } else {
      setErrorMessage(res.error || "Failed to transfer ownership.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-800">
              <Users className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Staff Accounts & Governance</h3>
              <p className="text-xs text-slate-500">Invitations, permissions & commercial lifecycle</p>
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
        <div className="mt-4 rounded-2xl border border-purple-200 bg-purple-50/60 p-3 text-xs text-purple-950 space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-purple-900">
            <Lock className="h-3.5 w-3.5" />
            <span>Commercial Sensitivity Safeguard</span>
          </div>
          <p className="leading-relaxed text-[11px] text-purple-900/90">
            Staff operators can record sales, goods receipts, customer collections, and count stock. Purchase costs,
            profit margins, and financial reports are strictly hidden server-side.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-4 flex gap-1.5 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-bold">
          <button
            onClick={() => setActiveTab("INVITE")}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "INVITE"
                ? "bg-purple-700 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            <span>Invite Operator</span>
          </button>
          <button
            onClick={() => setActiveTab("MEMBERS")}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "MEMBERS"
                ? "bg-purple-700 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Staff Roster ({staffMembers.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("DIRECT")}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "DIRECT"
                ? "bg-purple-700 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Direct Account</span>
          </button>
          <button
            onClick={() => setActiveTab("TRANSFER")}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "TRANSFER"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            <span>Ownership</span>
          </button>
        </div>

        {/* Feedback messages */}
        {errorMessage && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-800 border border-red-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 p-2.5 text-xs text-emerald-800 border border-emerald-200">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* TAB 1: INVITE OPERATOR VIA SINGLE-USE LINK */}
        {activeTab === "INVITE" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <LinkIcon className="h-4 w-4 text-purple-700" />
                <span>Generate Single-Use Staff Invitation</span>
              </h4>
              <p className="text-xs text-slate-600">
                Staff members join securely via an invite link. They will choose their own password upon activation.
              </p>

              <form onSubmit={handleGenerateInvite} className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Staff Member Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Aminu Bello"
                    value={inviteeName}
                    onChange={(e) => setInviteeName(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Staff Member Email <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. aminu@example.com"
                    value={inviteeEmail}
                    onChange={(e) => setInviteeEmail(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
                  />
                </div>

                {/* Delegated Capabilities Selection */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-purple-700" />
                      <span>Allowed Operational Capabilities</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">Owner Delegated</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {CAPABILITY_OPTIONS.map((cap) => {
                      const isChecked = inviteCapabilities.includes(cap.key);
                      return (
                        <label
                          key={cap.key}
                          className={`flex items-start gap-2 p-2 rounded-xl border cursor-pointer transition-all ${
                            isChecked
                              ? "bg-purple-50/60 border-purple-300 text-purple-950"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleInviteCap(cap.key)}
                            className="mt-0.5 h-3.5 w-3.5 rounded text-purple-600 focus:ring-purple-500 border-slate-300"
                          />
                          <div>
                            <div className="text-xs font-bold leading-tight">{cap.label}</div>
                            <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{cap.desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-purple-700 italic pt-1">
                    🔒 Purchase costs, product profit margins, and financial reports are strictly blocked server-side.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-purple-700 px-4 text-xs font-bold text-white shadow-xs hover:bg-purple-800 disabled:opacity-50 transition-all"
                >
                  <LinkIcon className="h-4 w-4" />
                  <span>{isSubmitting ? "Generating Link..." : "Create Single-Use Invitation Link"}</span>
                </button>
              </form>
            </div>

            {/* Generated Link Display */}
            {generatedInvite && (
              <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/80 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900">
                    Invitation Link Ready for {generatedInvite.inviteeName}
                  </span>
                  <span className="text-[10px] font-bold bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full">
                    Single-Use
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={generatedInvite.inviteUrl}
                    className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-mono text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800 transition-all"
                  >
                    {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedLink ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-emerald-800">
                  Send this link to the staff member. They will open it on their smartphone or browser to set their password.
                </p>
              </div>
            )}

            {/* Pending Invitations */}
            <div className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Pending Invitations ({staffInvitations.filter((i) => i.status === "PENDING").length})
              </h5>
              {staffInvitations.filter((i) => i.status === "PENDING").length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">
                  No pending invitations right now.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                  {staffInvitations
                    .filter((i) => i.status === "PENDING")
                    .map((inv) => (
                      <div key={inv.id} className="p-3 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-900">{inv.inviteeName}</div>
                          <div className="text-[11px] text-slate-500">
                            Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRevokeInvite(inv.id)}
                          className="flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-800 p-1.5 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Revoke</span>
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: STAFF ROSTER & LIFECYCLE MANAGEMENT */}
        {activeTab === "MEMBERS" && (
          <div className="mt-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Staff Members & Permissions
            </h4>

            {staffMembers.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                No staff members active. Invite a staff operator using the &quot;Invite Operator&quot; tab.
              </div>
            ) : (
              <div className="space-y-2.5">
                {staffMembers.map((staff) => {
                  const isSuspended = staff.status === "SUSPENDED" || staff.isActive === false;
                  const isDeactivated = staff.status === "DEACTIVATED";
                  const staffUserId = staff.userId || staff.id;

                  return (
                    <div
                      key={staff.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isDeactivated
                          ? "bg-slate-50 border-slate-200 opacity-60"
                          : isSuspended
                          ? "bg-amber-50/50 border-amber-200"
                          : "bg-white border-slate-200 shadow-2xs"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{staff.fullName}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                isDeactivated
                                  ? "bg-slate-200 text-slate-700"
                                  : isSuspended
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {isDeactivated ? "DEACTIVATED" : isSuspended ? "SUSPENDED" : "ACTIVE"}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{staff.email}</div>
                          {staff.activatedAt && (
                            <div className="text-[10px] text-slate-400 mt-1">
                              Active since {new Date(staff.activatedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>

                        {/* Lifecycle Controls */}
                        {!isDeactivated && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isSuspended ? (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(staffUserId, "ACTIVE", staff.fullName)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700"
                              >
                                <PlayCircle className="h-3.5 w-3.5" />
                                <span>Reactivate</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(staffUserId, "SUSPENDED", staff.fullName)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-100 text-amber-900 text-[11px] font-bold hover:bg-amber-200"
                              >
                                <PauseCircle className="h-3.5 w-3.5" />
                                <span>Suspend</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleStatusChange(staffUserId, "DEACTIVATED", staff.fullName)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200"
                            >
                              <X className="h-3.5 w-3.5" />
                              <span>Deactivate</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Delegated Capabilities display & editor */}
                      {!isDeactivated && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                              <ShieldCheck className="h-3.5 w-3.5 text-purple-700" />
                              <span>Delegated Capabilities</span>
                            </span>
                            {editingStaffId !== staffUserId ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingStaffId(staffUserId);
                                  setEditingCaps(
                                    staff.customCapabilities && staff.customCapabilities.length > 0
                                      ? staff.customCapabilities
                                      : ["CAN_SELL", "CAN_RECEIVE", "CAN_COLLECT", "CAN_COUNT"]
                                  );
                                }}
                                className="text-[11px] font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 hover:underline cursor-pointer"
                              >
                                <Sliders className="h-3 w-3" />
                                <span>Adjust Permissions</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingStaffId(null)}
                                className="text-[11px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                              >
                                Cancel
                              </button>
                            )}
                          </div>

                          {editingStaffId === staffUserId ? (
                            <div className="mt-2.5 rounded-xl border border-purple-200 bg-purple-50/50 p-3 space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {CAPABILITY_OPTIONS.map((cap) => {
                                  const isChecked = editingCaps.includes(cap.key);
                                  return (
                                    <label
                                      key={cap.key}
                                      className={`flex items-start gap-2 p-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                        isChecked
                                          ? "bg-white border-purple-300 font-bold text-purple-950"
                                          : "bg-white/60 border-slate-200 text-slate-600"
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleEditingCap(cap.key)}
                                        className="mt-0.5 h-3.5 w-3.5 rounded text-purple-600 border-slate-300"
                                      />
                                      <span>{cap.label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              <div className="flex justify-end pt-1">
                                <button
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={() => handleSaveStaffCapabilities(staffUserId)}
                                  className="px-3 py-1.5 rounded-xl bg-purple-700 text-white text-xs font-bold hover:bg-purple-800 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  <span>{isSubmitting ? "Saving..." : "Save Permissions"}</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {(staff.customCapabilities && staff.customCapabilities.length > 0
                                ? staff.customCapabilities
                                : ["CAN_SELL", "CAN_RECEIVE", "CAN_COLLECT", "CAN_COUNT"]
                              ).map((cap) => {
                                const labels: Record<string, string> = {
                                  CAN_SELL: "Sell Goods",
                                  CAN_RECEIVE: "Receive Deliveries",
                                  CAN_COLLECT: "Collect Debts",
                                  CAN_COUNT: "Count Stock",
                                  CAN_CHANGE_PRICE: "Change Prices",
                                  CAN_CORRECT_TRANSACTIONS: "Correct Sales",
                                };
                                return (
                                  <span
                                    key={cap}
                                    className="rounded-lg bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-800 border border-purple-100"
                                  >
                                    ✓ {labels[cap] || cap}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DIRECT ACCOUNT CREATION */}
        {activeTab === "DIRECT" && (
          <form onSubmit={handleDirectCreate} className="mt-4 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <UserPlus className="h-4 w-4 text-purple-700" />
                <span>Direct Manual Staff Provisioning</span>
              </h4>
              <p className="text-xs text-slate-600">
                Create an account directly with a chosen password to hand to a shop clerk immediately.
              </p>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Musa Aminu"
                    value={directFullName}
                    onChange={(e) => setDirectFullName(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Email / Login ID *</label>
                    <input
                      type="email"
                      required
                      placeholder="musa@shop.com"
                      value={directEmail}
                      onChange={(e) => setDirectEmail(e.target.value)}
                      className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Temporary Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="At least 6 characters"
                      value={directPassword}
                      onChange={(e) => setDirectPassword(e.target.value)}
                      className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-purple-700 px-4 text-xs font-bold text-white shadow-xs hover:bg-purple-800 disabled:opacity-50 transition-all"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>{isSubmitting ? "Creating..." : "Create Staff Account"}</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* TAB 4: PROTECTED OWNERSHIP TRANSFER */}
        {activeTab === "TRANSFER" && (
          <form onSubmit={handleTransferOwnership} className="mt-4 space-y-3">
            <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                <ShieldAlert className="h-4 w-4 text-amber-700" />
                <span>Protected Business Ownership Transfer</span>
              </div>
              <p className="text-xs text-amber-950 leading-relaxed">
                This will transfer primary commercial ownership of this business tenant to an active member. The new
                owner will have full control over shop settings, staff, and financial reports. You will retain staff operator access.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Select Successor (New Owner) *</label>
                <select
                  required
                  value={transferTargetUserId}
                  onChange={(e) => setTransferTargetUserId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white"
                >
                  <option value="">-- Choose an active staff member --</option>
                  {staffMembers
                    .filter((s) => s.status !== "DEACTIVATED")
                    .map((s) => (
                      <option key={s.id} value={s.userId || s.id}>
                        {s.fullName} ({s.email})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Reason for Transfer <span className="text-slate-500 font-normal">(Recorded in security audit)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Partner buyout / Shop manager promotion"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Confirm Your Owner Password (Re-authentication) *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter your current password"
                  value={transferPassword}
                  onChange={(e) => setTransferPassword(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !transferTargetUserId || !transferPassword}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-amber-700 disabled:opacity-50 transition-all"
              >
                <ArrowRightLeft className="h-4 w-4" />
                <span>{isSubmitting ? "Transferring..." : "Confirm Ownership Transfer"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
