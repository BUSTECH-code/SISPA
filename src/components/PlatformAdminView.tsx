"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useStock } from "@/context/StockContext";
import {
  ShieldAlert,
  Building2,
  Users,
  CreditCard,
  Headphones,
  History,
  Settings as SettingsIcon,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  RefreshCw,
  Lock,
  Unlock,
  Eye,
  X,
  ChevronRight,
  AlertCircle,
  Filter,
  ArrowRight,
  FileText,
  Check,
  Ban,
  Phone,
  Mail,
  UserCheck,
  Calendar,
  Sparkles,
  Layers,
  Power,
  Database,
  Radio,
} from "lucide-react";

type AdminTab = "OVERVIEW" | "BUSINESSES" | "SUBSCRIPTIONS" | "SUPPORT" | "AUDIT" | "SETTINGS";

interface OwnerInfo {
  id: number;
  fullName: string;
  email: string;
  phone?: string | null;
}

interface StaffInfo {
  id: number;
  fullName: string;
  email: string;
  role: string;
  status: string;
}

interface OperationalCounts {
  products: number;
  customers: number;
  stockLedgerEntries: number;
}

interface PlatformBusiness {
  id: number;
  name: string;
  currency: string;
  state: "ACTIVE" | "RESTRICTED" | "SUSPENDED";
  subscriptionPlan: "TRIAL" | "STANDARD" | "PRO" | "ENTERPRISE";
  subscriptionStatus: "TRIAL" | "ACTIVE" | "PAST_DUE" | "GRACE_PERIOD" | "RESTRICTED" | "SUSPENDED" | "CANCELLED";
  trialEndsAt: string | null;
  createdAt: string;
  owner: OwnerInfo | null;
  staffMembers: StaffInfo[];
  memberCount: number;
  counts: OperationalCounts;
  hasActiveSupportGrant: boolean;
  activeSupportGrant: any | null;
}

interface SupportGrant {
  id: number;
  businessId: number;
  businessName: string;
  requestingUserId: number;
  requestingOwnerName: string;
  platformAdminUserId: number | null;
  approvingAdminName: string | null;
  reason: string;
  scope: "ACCOUNT_WHATSAPP" | "CATALOG_DIAGNOSTICS" | "DEBT_RECONCILIATION" | "SYSTEM_CONFIG" | "READ_ONLY";
  requestedDurationMinutes: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "REVOKED";
  approvedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  isActiveNow: boolean;
}

interface AuditLogEntry {
  id: number;
  businessId: number;
  businessName?: string;
  actorId: number;
  actorName: string;
  actorRole: string;
  eventType: string;
  entityType: string;
  entityId: number | null;
  description: string;
  reason: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

interface PlatformSettingsData {
  id?: number;
  maintenanceMode: boolean;
  maintenanceNotice: string | null;
  defaultTrialDays: number;
  gracePeriodDays: number;
  allowSelfRegistration: boolean;
}

interface PlatformOverviewData {
  stats: {
    totalBusinesses: number;
    activeBusinesses: number;
    restrictedBusinesses: number;
    suspendedBusinesses: number;
    trialSubscriptions: number;
    activeSubscriptions: number;
    pastDueSubscriptions: number;
    totalUsersCount: number;
    totalStaffCount: number;
    pendingSupportRequests: number;
    activeSupportGrants: number;
  };
  businesses: PlatformBusiness[];
  supportGrants: SupportGrant[];
  recentAudits: AuditLogEntry[];
  platformSettings: PlatformSettingsData;
}

export function PlatformAdminView() {
  const { user } = useStock();
  const [activeTab, setActiveTab] = useState<AdminTab>("OVERVIEW");
  const [data, setData] = useState<PlatformOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Business management state
  const [businessSearch, setBusinessSearch] = useState("");
  const [businessFilterState, setBusinessFilterState] = useState<string>("ALL");
  const [inspectingBusiness, setInspectingBusiness] = useState<PlatformBusiness | null>(null);

  // Change State modal
  const [stateModalOpen, setStateModalOpen] = useState(false);
  const [selectedBizForState, setSelectedBizForState] = useState<PlatformBusiness | null>(null);
  const [targetState, setTargetState] = useState<"ACTIVE" | "RESTRICTED" | "SUSPENDED">("ACTIVE");
  const [stateChangeReason, setStateChangeReason] = useState("");
  const [isSubmittingState, setIsSubmittingState] = useState(false);

  // Subscription modal
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [selectedSubBiz, setSelectedSubBiz] = useState<PlatformBusiness | null>(null);
  const [subPlan, setSubPlan] = useState<string>("STANDARD");
  const [subStatus, setSubStatus] = useState<string>("ACTIVE");
  const [extendDays, setExtendDays] = useState<string>("0");
  const [subChangeReason, setSubChangeReason] = useState("");
  const [isSubmittingSub, setIsSubmittingSub] = useState(false);

  // Support Request Review (Approve / Reject) modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedGrantForReview, setSelectedGrantForReview] = useState<SupportGrant | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Direct Platform Support Creation Modal
  const [directSupportModalOpen, setDirectSupportModalOpen] = useState(false);
  const [directSupportBizId, setDirectSupportBizId] = useState<number | "">("");
  const [directSupportReason, setDirectSupportReason] = useState("");
  const [directSupportScope, setDirectSupportScope] = useState<
    "ACCOUNT_WHATSAPP" | "CATALOG_DIAGNOSTICS" | "DEBT_RECONCILIATION" | "SYSTEM_CONFIG" | "READ_ONLY"
  >("ACCOUNT_WHATSAPP");
  const [directSupportDuration, setDirectSupportDuration] = useState(30);
  const [isSubmittingDirectSupport, setIsSubmittingDirectSupport] = useState(false);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<PlatformSettingsData>({
    maintenanceMode: false,
    maintenanceNotice: "",
    defaultTrialDays: 14,
    gracePeriodDays: 7,
    allowSelfRegistration: true,
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Audit filter state
  const [auditFilterEventType, setAuditFilterEventType] = useState<string>("ALL");
  const [auditSearch, setAuditSearch] = useState("");

  const fetchOverview = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/overview");
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        if (json.data.platformSettings) {
          setSettingsForm({
            maintenanceMode: Boolean(json.data.platformSettings.maintenanceMode),
            maintenanceNotice: json.data.platformSettings.maintenanceNotice || "",
            defaultTrialDays: Number(json.data.platformSettings.defaultTrialDays) || 14,
            gracePeriodDays: Number(json.data.platformSettings.gracePeriodDays) || 7,
            allowSelfRegistration: Boolean(json.data.platformSettings.allowSelfRegistration ?? true),
          });
        }
      } else {
        setError(json.error || "Failed to load platform operations data.");
      }
    } catch {
      setError("Network failure communicating with platform API.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const triggerSuccessBanner = (msg: string) => {
    setSuccessBanner(msg);
    setTimeout(() => setSuccessBanner(null), 4000);
  };

  // 1. Business State Transition
  const handleUpdateBusinessState = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBizForState || !stateChangeReason.trim()) return;

    setIsSubmittingState(true);
    try {
      const res = await fetch("/api/admin/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: selectedBizForState.id,
          state: targetState,
          reason: stateChangeReason.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStateModalOpen(false);
        setStateChangeReason("");
        triggerSuccessBanner(`Tenant "${selectedBizForState.name}" state updated to ${targetState}.`);
        await fetchOverview();
      } else {
        alert(json.error || "Failed to update business state.");
      }
    } catch {
      alert("Network error updating business state.");
    } finally {
      setIsSubmittingState(false);
    }
  };

  // 2. Subscription Intervention
  const handleUpdateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubBiz) return;

    setIsSubmittingSub(true);
    try {
      const res = await fetch("/api/admin/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: selectedSubBiz.id,
          plan: subPlan,
          status: subStatus,
          extendTrialDays: Number(extendDays) || 0,
          reason: subChangeReason.trim() || "Administrative subscription intervention",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSubModalOpen(false);
        setSubChangeReason("");
        setExtendDays("0");
        triggerSuccessBanner(`Subscription updated for "${selectedSubBiz.name}".`);
        await fetchOverview();
      } else {
        alert(json.error || "Failed to update subscription.");
      }
    } catch {
      alert("Network error updating subscription.");
    } finally {
      setIsSubmittingSub(false);
    }
  };

  // 3. Support Request Approval
  const handleApproveSupportRequest = async (grantId: number) => {
    if (!confirm("Authorize this scoped, time-bound support session? This action will be audited.")) return;

    try {
      const res = await fetch("/api/admin/support-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE",
          grantId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        triggerSuccessBanner(`Support request #${grantId} approved and access session activated.`);
        await fetchOverview();
      } else {
        alert(json.error || "Failed to approve support request.");
      }
    } catch {
      alert("Network error approving support request.");
    }
  };

  // 4. Support Request Rejection
  const handleRejectSupportRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGrantForReview || !rejectionReason.trim()) return;

    setIsSubmittingReview(true);
    try {
      const res = await fetch("/api/admin/support-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REJECT",
          grantId: selectedGrantForReview.id,
          rejectionReason: rejectionReason.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setReviewModalOpen(false);
        setRejectionReason("");
        triggerSuccessBanner(`Support request #${selectedGrantForReview.id} rejected.`);
        await fetchOverview();
      } else {
        alert(json.error || "Failed to reject support request.");
      }
    } catch {
      alert("Network error rejecting support request.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // 5. Support Access Revocation
  const handleRevokeSupportGrant = async (grantId: number) => {
    const reason = prompt("Enter justification reason for immediate session termination:", "Administrative termination");
    if (reason === null) return;

    try {
      const res = await fetch("/api/admin/support-grant", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grantId,
          revocationReason: reason.trim() || "Immediate session termination by Platform Administrator",
        }),
      });
      const json = await res.json();
      if (json.success) {
        triggerSuccessBanner(`Support session #${grantId} revoked immediately.`);
        await fetchOverview();
      } else {
        alert(json.error || "Failed to revoke support grant.");
      }
    } catch {
      alert("Network error revoking support grant.");
    }
  };

  // 6. Direct Platform Support Session Creation
  const handleCreateDirectSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directSupportBizId || !directSupportReason.trim()) return;

    setIsSubmittingDirectSupport(true);
    try {
      const res = await fetch("/api/admin/support-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: Number(directSupportBizId),
          reason: directSupportReason.trim(),
          scope: directSupportScope,
          durationMinutes: Number(directSupportDuration) || 30,
        }),
      });
      const json = await res.json();
      if (json.success) {
        // Auto-approve newly created platform ticket
        await fetch("/api/admin/support-grant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "APPROVE",
            grantId: json.data.id,
          }),
        });
        setDirectSupportModalOpen(false);
        setDirectSupportReason("");
        setDirectSupportBizId("");
        triggerSuccessBanner("Emergency platform support session authorized and active.");
        await fetchOverview();
      } else {
        alert(json.error || "Failed to create support session.");
      }
    } catch {
      alert("Network error creating support session.");
    } finally {
      setIsSubmittingDirectSupport(false);
    }
  };

  // 7. Save Platform Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      const json = await res.json();
      if (json.success) {
        triggerSuccessBanner("Platform settings saved and logged to security audit trail.");
        await fetchOverview();
      } else {
        alert(json.error || "Failed to save settings.");
      }
    } catch {
      alert("Network error updating platform settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Filtered Businesses
  const filteredBusinesses = (data?.businesses || []).filter((b) => {
    const q = businessSearch.toLowerCase();
    const matchesSearch =
      b.name.toLowerCase().includes(q) ||
      (b.owner?.fullName || "").toLowerCase().includes(q) ||
      (b.owner?.email || "").toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (businessFilterState === "ALL") return true;
    if (businessFilterState === "ACTIVE") return b.state === "ACTIVE";
    if (businessFilterState === "RESTRICTED") return b.state === "RESTRICTED";
    if (businessFilterState === "SUSPENDED") return b.state === "SUSPENDED";
    if (businessFilterState === "TRIAL") return b.subscriptionStatus === "TRIAL";
    if (businessFilterState === "PAST_DUE") return b.subscriptionStatus === "PAST_DUE" || b.subscriptionStatus === "GRACE_PERIOD";
    return true;
  });

  // Filtered Audits
  const filteredAudits = (data?.recentAudits || []).filter((log) => {
    const q = auditSearch.toLowerCase();
    const matchesSearch =
      (log.description || "").toLowerCase().includes(q) ||
      (log.actorName || "").toLowerCase().includes(q) ||
      (log.eventType || "").toLowerCase().includes(q) ||
      (log.reason || "").toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (auditFilterEventType === "ALL") return true;
    return log.eventType === auditFilterEventType;
  });

  const pendingRequests = (data?.supportGrants || []).filter((g) => g.status === "PENDING");
  const activeGrants = (data?.supportGrants || []).filter((g) => g.isActiveNow);
  const pastDueSubscriptionsList = (data?.businesses || []).filter(
    (b) => b.subscriptionStatus === "PAST_DUE" || b.subscriptionStatus === "GRACE_PERIOD"
  );
  const restrictedOrSuspendedBusinesses = (data?.businesses || []).filter((b) => b.state !== "ACTIVE");

  return (
    <div className="space-y-6 pb-24">
      {/* 1. TOP PLATFORM ADMIN BANNER */}
      <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-2xl border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white font-sans">
                  SISPA Operations Console
                </h1>
                <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-300 border border-amber-400/30">
                  Platform Admin
                </span>
                <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300 border border-slate-700">
                  Fleet v1.0
                </span>
              </div>
              <p className="mt-1 text-xs sm:text-sm text-slate-400 leading-relaxed max-w-2xl">
                Infrastructure operator console. Governs tenant businesses, commercial subscriptions, strict support access authorization, and security compliance outside the customer operational hierarchy.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
            <button
              onClick={() => {
                setDirectSupportModalOpen(true);
              }}
              className="flex min-h-[40px] items-center gap-2 rounded-xl bg-amber-500 px-4 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors shadow-sm"
            >
              <Headphones className="h-4 w-4" />
              <span>Issue Support Grant</span>
            </button>

            <button
              onClick={fetchOverview}
              disabled={isLoading}
              className="flex min-h-[40px] items-center gap-2 rounded-xl bg-slate-900 border border-slate-800 px-4 text-xs font-bold text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-amber-400" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 2. PLATFORM CONSOLE NAVIGATION TABS */}
        <div className="mt-6 flex flex-wrap gap-1.5 border-t border-slate-800/80 pt-4">
          <button
            onClick={() => setActiveTab("OVERVIEW")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeTab === "OVERVIEW"
                ? "bg-amber-500 text-slate-950 shadow-md font-black"
                : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab("BUSINESSES")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeTab === "BUSINESSES"
                ? "bg-amber-500 text-slate-950 shadow-md font-black"
                : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>Businesses</span>
            {data && (
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${activeTab === "BUSINESSES" ? "bg-slate-950 text-white" : "bg-slate-800 text-slate-300"}`}>
                {data.stats.totalBusinesses}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("SUBSCRIPTIONS")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeTab === "SUBSCRIPTIONS"
                ? "bg-amber-500 text-slate-950 shadow-md font-black"
                : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>Subscriptions</span>
            {data && data.stats.pastDueSubscriptions > 0 && (
              <span className="rounded-full bg-red-600 px-1.5 py-0.2 text-[10px] font-black text-white">
                {data.stats.pastDueSubscriptions}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("SUPPORT")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeTab === "SUPPORT"
                ? "bg-amber-500 text-slate-950 shadow-md font-black"
                : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
            }`}
          >
            <Headphones className="h-3.5 w-3.5" />
            <span>Support</span>
            {pendingRequests.length > 0 && (
              <span className="rounded-full bg-amber-400 text-slate-950 px-1.5 py-0.2 text-[10px] font-black">
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("AUDIT")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeTab === "AUDIT"
                ? "bg-amber-500 text-slate-950 shadow-md font-black"
                : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Audit</span>
            {data && (
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${activeTab === "AUDIT" ? "bg-slate-950 text-white" : "bg-slate-800 text-slate-300"}`}>
                {data.recentAudits.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("SETTINGS")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeTab === "SETTINGS"
                ? "bg-amber-500 text-slate-950 shadow-md font-black"
                : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
            }`}
          >
            <SettingsIcon className="h-3.5 w-3.5" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-bold text-emerald-900 shadow-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* 3. TAB CONTENT ROUTER */}

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW (Answers the 5 Operational Questions directly) */}
      {/* ========================================================================= */}
      {activeTab === "OVERVIEW" && (
        <div className="space-y-6">
          {/* Metrics Row */}
          {data && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Building2 className="h-4 w-4 text-amber-600" />
                  <span>Tenants</span>
                </div>
                <div className="mt-2 text-2xl font-black text-slate-900">
                  {data.stats.totalBusinesses}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                  {data.stats.activeBusinesses} Active • {data.stats.restrictedBusinesses + data.stats.suspendedBusinesses} Restricted
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <CreditCard className="h-4 w-4 text-emerald-600" />
                  <span>Subscribed</span>
                </div>
                <div className="mt-2 text-2xl font-black text-emerald-700">
                  {data.stats.activeSubscriptions}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                  Commercial paid tier
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span>Trials</span>
                </div>
                <div className="mt-2 text-2xl font-black text-blue-700">
                  {data.stats.trialSubscriptions}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                  In 14-day eval
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span>Past Due</span>
                </div>
                <div className="mt-2 text-2xl font-black text-red-700">
                  {data.stats.pastDueSubscriptions}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                  Grace period active
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Headphones className="h-4 w-4 text-purple-600" />
                  <span>Waiting Support</span>
                </div>
                <div className="mt-2 text-2xl font-black text-purple-700">
                  {pendingRequests.length}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                  Awaiting review
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Lock className="h-4 w-4 text-amber-700" />
                  <span>Active Grants</span>
                </div>
                <div className="mt-2 text-2xl font-black text-amber-800">
                  {activeGrants.length}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                  Live temporary sessions
                </div>
              </div>
            </div>
          )}

          {/* 5 OPERATIONAL QUESTIONS & ACTION ITEMS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Question 1: How is SISPA doing operationally? */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Platform Operational Health</h3>
                    <p className="text-[11px] text-slate-500">Core subsystems & database fleet</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-black text-emerald-800 border border-emerald-200">
                  100% HEALTHY
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                  <div className="text-slate-500 text-[10px] font-bold uppercase">Total Users</div>
                  <div className="text-base font-black text-slate-900 mt-0.5">{data?.stats.totalUsersCount} registered</div>
                  <div className="text-[10px] text-slate-400">{data?.stats.totalStaffCount} delegated staff</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                  <div className="text-slate-500 text-[10px] font-bold uppercase">Maintenance Mode</div>
                  <div className="text-base font-black text-slate-900 mt-0.5">
                    {data?.platformSettings.maintenanceMode ? "ACTIVE (Restricted)" : "DISABLED (Normal)"}
                  </div>
                  <div className="text-[10px] text-slate-400">Default Trial: {data?.platformSettings.defaultTrialDays}d</div>
                </div>
              </div>
            </div>

            {/* Question 2: Which support requests are waiting? */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 text-purple-800 font-bold">
                    <Headphones className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Support Requests Waiting Review</h3>
                    <p className="text-[11px] text-slate-500">Owner-initiated access proposals</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab("SUPPORT")}
                  className="text-xs font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1"
                >
                  <span>View All</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500 border border-slate-100">
                  No support requests currently awaiting review.
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingRequests.slice(0, 2).map((req) => (
                    <div key={req.id} className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{req.businessName}</span>
                        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-900">
                          {req.scope} • {req.requestedDurationMinutes}m
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-700 line-clamp-1 italic">
                        &quot;{req.reason}&quot;
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => handleApproveSupportRequest(req.id)}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition-colors"
                        >
                          Approve ({req.requestedDurationMinutes}m)
                        </button>
                        <button
                          onClick={() => {
                            setSelectedGrantForReview(req);
                            setReviewModalOpen(true);
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Question 3: Which subscriptions need attention? */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-red-800 font-bold">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Subscriptions Requiring Attention</h3>
                    <p className="text-[11px] text-slate-500">Past due or expiring grace periods</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab("SUBSCRIPTIONS")}
                  className="text-xs font-bold text-red-700 hover:text-red-900 flex items-center gap-1"
                >
                  <span>Manage</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {pastDueSubscriptionsList.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500 border border-slate-100">
                  All commercial subscriptions are currently active or in trial.
                </div>
              ) : (
                <div className="space-y-2">
                  {pastDueSubscriptionsList.map((b) => (
                    <div key={b.id} className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/40 p-2.5 text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{b.name}</div>
                        <div className="text-[11px] text-red-700 font-medium">
                          {b.subscriptionPlan} • {b.subscriptionStatus} (Grace Period)
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedSubBiz(b);
                          setSubPlan(b.subscriptionPlan);
                          setSubStatus(b.subscriptionStatus);
                          setSubModalOpen(true);
                        }}
                        className="rounded-lg bg-white border border-red-300 px-2.5 py-1 text-[11px] font-bold text-red-800 hover:bg-red-50"
                      >
                        Intervene
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Question 4: Which businesses need platform attention? */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-900 font-bold">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Restricted / Suspended Tenants</h3>
                    <p className="text-[11px] text-slate-500">Shops blocked from regular operations</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab("BUSINESSES")}
                  className="text-xs font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1"
                >
                  <span>View All</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {restrictedOrSuspendedBusinesses.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500 border border-slate-100">
                  No businesses currently restricted or suspended.
                </div>
              ) : (
                <div className="space-y-2">
                  {restrictedOrSuspendedBusinesses.map((b) => (
                    <div key={b.id} className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/40 p-2.5 text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{b.name}</div>
                        <div className="text-[11px] text-amber-900 font-medium">
                          State: <span className="font-bold">{b.state}</span> • Owner: {b.owner?.fullName || "Unassigned"}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedBizForState(b);
                          setTargetState("ACTIVE");
                          setStateModalOpen(true);
                        }}
                        className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-slate-800"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ACTIVE LIVE SUPPORT SESSIONS BANNER */}
          {activeGrants.length > 0 && (
            <div className="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                  </span>
                  <h3 className="text-sm font-black text-amber-950">Active Scoped Support Sessions ({activeGrants.length})</h3>
                </div>
                <span className="text-xs text-amber-900 font-semibold">Strict time-bound isolation</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeGrants.map((grant) => (
                  <div key={grant.id} className="rounded-2xl border border-amber-200 bg-white p-3.5 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">{grant.businessName}</span>
                      <span className="rounded-md bg-amber-100 text-amber-900 px-2 py-0.5 text-[10px] font-black border border-amber-300">
                        {grant.scope}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 italic">
                      &quot;{grant.reason}&quot;
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                      <span className="text-slate-500">
                        Expires: {grant.expiresAt ? new Date(grant.expiresAt).toLocaleTimeString() : "Shortly"}
                      </span>
                      <button
                        onClick={() => handleRevokeSupportGrant(grant.id)}
                        className="rounded-lg bg-red-50 border border-red-200 px-2 py-1 text-[10px] font-bold text-red-700 hover:bg-red-100"
                      >
                        Revoke Immediately
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: BUSINESSES (Tenant roster, inspection, state controls) */}
      {/* ========================================================================= */}
      {activeTab === "BUSINESSES" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">Commercial Tenant Registry</h2>
              <p className="text-xs text-slate-500">
                Inspect business accounts, owners, staff rosters, and operational states.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search shop, owner, email..."
                  value={businessSearch}
                  onChange={(e) => setBusinessSearch(e.target.value)}
                  className="min-h-[38px] rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <select
                value={businessFilterState}
                onChange={(e) => setBusinessFilterState(e.target.value)}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
              >
                <option value="ALL">All States</option>
                <option value="ACTIVE">Active State</option>
                <option value="RESTRICTED">Restricted</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="TRIAL">Trial Status</option>
                <option value="PAST_DUE">Past Due / Grace</option>
              </select>
            </div>
          </div>

          {/* Tenants Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">Business / Tenant</th>
                  <th className="py-3.5 px-4">Owner & Contact</th>
                  <th className="py-3.5 px-4">Staff Members</th>
                  <th className="py-3.5 px-4">Subscription</th>
                  <th className="py-3.5 px-4">Tenant State</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBusinesses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No businesses found matching &quot;{businessSearch}&quot;.
                    </td>
                  </tr>
                ) : (
                  filteredBusinesses.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-sm">{b.name}</div>
                        <div className="text-[11px] text-slate-500">
                          Tenant #{b.id} • {b.currency} • Est. {new Date(b.createdAt).toLocaleDateString()}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {b.owner ? (
                          <div>
                            <div className="font-semibold text-slate-900">{b.owner.fullName}</div>
                            <div className="text-[11px] text-slate-500">{b.owner.email}</div>
                            {b.owner.phone && <div className="text-[10px] text-slate-400">{b.owner.phone}</div>}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No owner assigned</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-semibold text-slate-800">{b.memberCount} total</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {b.staffMembers.filter((s) => s.status === "ACTIVE").length} active staff
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{b.subscriptionPlan}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                              b.subscriptionStatus === "ACTIVE"
                                ? "bg-emerald-100 text-emerald-800"
                                : b.subscriptionStatus === "TRIAL"
                                ? "bg-blue-100 text-blue-800"
                                : b.subscriptionStatus === "PAST_DUE" || b.subscriptionStatus === "GRACE_PERIOD"
                                ? "bg-red-100 text-red-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {b.subscriptionStatus}
                          </span>
                        </div>
                        {b.trialEndsAt && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Trial: {new Date(b.trialEndsAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black border ${
                            b.state === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : b.state === "RESTRICTED"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-red-50 text-red-800 border-red-200"
                          }`}
                        >
                          {b.state === "ACTIVE" ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Ban className="h-3 w-3 text-amber-600" />
                          )}
                          <span>{b.state}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Inspect Details */}
                          <button
                            onClick={() => setInspectingBusiness(b)}
                            title="Inspect Tenant Architecture & High-Level Metadata"
                            className="flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5 text-slate-500" />
                            <span>Inspect</span>
                          </button>

                          {/* Change State */}
                          <button
                            onClick={() => {
                              setSelectedBizForState(b);
                              setTargetState(b.state === "ACTIVE" ? "RESTRICTED" : "ACTIVE");
                              setStateModalOpen(true);
                            }}
                            className={`flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                              b.state === "ACTIVE"
                                ? "bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100"
                                : "bg-emerald-600 text-white hover:bg-emerald-700"
                            }`}
                          >
                            {b.state === "ACTIVE" ? "Restrict / Suspend" : "Restore"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SUBSCRIPTIONS (Plans, Entitlements, Lifecycle states) */}
      {/* ========================================================================= */}
      {activeTab === "SUBSCRIPTIONS" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">Subscription & Entitlement Governance</h2>
            <p className="text-xs text-slate-500">
              Manage SaaS commercial plans, grace periods, trial expirations, and account standing.
            </p>
          </div>

          {/* Entitlement & Plan Matrix Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-black text-slate-900">SISPA Commercial Plan Architecture</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5">
                <div className="font-bold text-blue-800 text-sm">TRIAL (14 Days)</div>
                <div className="text-[11px] text-slate-500">Free evaluation for new wholesalers</div>
                <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4 pt-1">
                  <li>Up to 100 catalog products</li>
                  <li>1 delegated staff operator</li>
                  <li>Standard sales & stock ledger</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5">
                <div className="font-bold text-emerald-800 text-sm">STANDARD (₦15k/mo)</div>
                <div className="text-[11px] text-slate-500">For established single-store depots</div>
                <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4 pt-1">
                  <li>Unlimited catalog items</li>
                  <li>Up to 5 delegated staff accounts</li>
                  <li>WhatsApp daily stock intelligence</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5">
                <div className="font-bold text-purple-800 text-sm">PRO (₦35k/mo)</div>
                <div className="text-[11px] text-slate-500">Multi-yard & high-volume merchants</div>
                <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4 pt-1">
                  <li>Unlimited staff & capability matrices</li>
                  <li>Multi-depot transfer auditing</li>
                  <li>Priority technical support SLA</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5">
                <div className="font-bold text-slate-900 text-sm">ENTERPRISE (Custom)</div>
                <div className="text-[11px] text-slate-500">Distributor fleets & regional syndicates</div>
                <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4 pt-1">
                  <li>Custom ERP webhook pipelines</li>
                  <li>Dedicated account manager</li>
                  <li>Contractual 99.9% availability SLA</li>
                </ul>
              </div>
            </div>

            {/* Lifecycle Stages Guide */}
            <div className="mt-2 rounded-xl bg-slate-100/80 p-3 text-[11px] text-slate-600 flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-900">Subscription Lifecycle Flow:</span>
              <span className="rounded bg-blue-100 text-blue-800 px-2 py-0.5 font-bold">TRIAL</span>
              <span>→</span>
              <span className="rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 font-bold">ACTIVE</span>
              <span>→</span>
              <span className="rounded bg-amber-100 text-amber-900 px-2 py-0.5 font-bold">PAST_DUE</span>
              <span>→</span>
              <span className="rounded bg-red-100 text-red-900 px-2 py-0.5 font-bold">GRACE_PERIOD (7d)</span>
              <span>→</span>
              <span className="rounded bg-slate-200 text-slate-800 px-2 py-0.5 font-bold">RESTRICTED</span>
              <span>→</span>
              <span className="rounded bg-red-900 text-white px-2 py-0.5 font-bold">SUSPENDED</span>
            </div>
          </div>

          {/* Subscriptions Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">Business</th>
                  <th className="py-3.5 px-4">Plan Tier</th>
                  <th className="py-3.5 px-4">Status & Health</th>
                  <th className="py-3.5 px-4">Trial / Period Expiry</th>
                  <th className="py-3.5 px-4 text-right">Intervention</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.businesses || []).map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{b.name}</div>
                      <div className="text-[11px] text-slate-500">Tenant #{b.id} • Owner: {b.owner?.fullName || "None"}</div>
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 text-sm">{b.subscriptionPlan}</span>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                          b.subscriptionStatus === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800"
                            : b.subscriptionStatus === "TRIAL"
                            ? "bg-blue-100 text-blue-800"
                            : b.subscriptionStatus === "PAST_DUE" || b.subscriptionStatus === "GRACE_PERIOD"
                            ? "bg-red-100 text-red-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {b.subscriptionStatus}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-600">
                      {b.trialEndsAt ? (
                        <div>
                          <div className="font-medium">{new Date(b.trialEndsAt).toLocaleDateString()}</div>
                          <div className="text-[10px] text-slate-400">Trial end date</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Regular recurring</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedSubBiz(b);
                          setSubPlan(b.subscriptionPlan);
                          setSubStatus(b.subscriptionStatus);
                          setSubModalOpen(true);
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 shadow-2xs transition-colors"
                      >
                        Modify Subscription
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SUPPORT (Explicit, Scoped, Time-Bound, Revocable, Audited) */}
      {/* ========================================================================= */}
      {activeTab === "SUPPORT" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">Support Access Governance</h2>
            <p className="text-xs text-slate-500">
              Review owner requests, manage active scoped grants, and audit platform support interactions.
            </p>
          </div>

          {/* Security Principle Banner */}
          <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5 shadow-xs text-xs text-amber-950 space-y-2">
            <div className="flex items-center gap-2 font-black text-sm text-amber-900">
              <ShieldAlert className="h-5 w-5 text-amber-700" />
              <span>Strict Support Authorization Mandate</span>
            </div>
            <p className="leading-relaxed">
              Platform Administrators do not possess casual, un-audited access to customer stores.
              All administrative access into a tenant account must be:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 font-bold">
              <div className="rounded-xl bg-white/80 p-2 text-center border border-amber-300">
                1. Explicit
              </div>
              <div className="rounded-xl bg-white/80 p-2 text-center border border-amber-300">
                2. Scoped
              </div>
              <div className="rounded-xl bg-white/80 p-2 text-center border border-amber-300">
                3. Time-Bound
              </div>
              <div className="rounded-xl bg-white/80 p-2 text-center border border-amber-300">
                4. Revocable
              </div>
              <div className="rounded-xl bg-white/80 p-2 text-center border border-amber-300 col-span-2 sm:col-span-1">
                5. Audited
              </div>
            </div>
          </div>

          {/* SECTION 1: PENDING SUPPORT REQUESTS */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Owner Support Requests Awaiting Platform Approval ({pendingRequests.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Customer shop proprietors requesting technical troubleshooting assistance.
                </p>
              </div>
            </div>

            {pendingRequests.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-500 border border-slate-100">
                No pending support requests. All customer requests have been answered.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingRequests.map((grant) => (
                  <div key={grant.id} className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {grant.businessName}
                        </span>
                        <span className="rounded bg-purple-100 text-purple-900 px-2 py-0.5 text-[10px] font-bold border border-purple-200">
                          Scope: {grant.scope}
                        </span>
                        <span className="rounded bg-blue-100 text-blue-900 px-2 py-0.5 text-[10px] font-bold">
                          Duration: {grant.requestedDurationMinutes} mins
                        </span>
                      </div>
                      <div className="text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">Requested by:</span> {grant.requestingOwnerName} • {new Date(grant.createdAt).toLocaleString()}
                      </div>
                      <div className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-800 border border-slate-200 max-w-2xl">
                        <span className="font-bold text-slate-700">Problem Statement:</span> &quot;{grant.reason}&quot;
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start lg:self-center">
                      <button
                        onClick={() => handleApproveSupportRequest(grant.id)}
                        className="flex min-h-[36px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-colors"
                      >
                        <Check className="h-4 w-4" />
                        <span>Authorize Access</span>
                      </button>

                      <button
                        onClick={() => {
                          setSelectedGrantForReview(grant);
                          setReviewModalOpen(true);
                        }}
                        className="flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Ban className="h-4 w-4" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 2: ACTIVE SUPPORT SESSIONS */}
          {activeGrants.length > 0 && (
            <div className="rounded-3xl border border-amber-300 bg-amber-50/50 p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-black text-amber-950">
                Active Temporary Support Grants ({activeGrants.length})
              </h3>

              <div className="divide-y divide-amber-200/60">
                {activeGrants.map((grant) => (
                  <div key={grant.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{grant.businessName}</span>
                        <span className="rounded bg-amber-200 text-amber-900 px-2 py-0.5 text-[10px] font-black">
                          {grant.scope}
                        </span>
                        <span className="rounded-full bg-emerald-100 text-emerald-900 px-2 py-0.5 text-[10px] font-black">
                          ACTIVE NOW
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        Reason: &quot;{grant.reason}&quot;
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Approved by {grant.approvingAdminName || "Platform Admin"} • Auto-expires at: {grant.expiresAt ? new Date(grant.expiresAt).toLocaleTimeString() : "Shortly"}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRevokeSupportGrant(grant.id)}
                      className="flex min-h-[34px] items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3.5 py-1 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      <span>Revoke Access</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 3: HISTORICAL SUPPORT GRANTS */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-black text-slate-900">Support Grant History & Log</h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Business</th>
                    <th className="py-3 px-4">Scope</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Reason / Notes</th>
                    <th className="py-3 px-4">Timestamps</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.supportGrants || []).map((grant) => (
                    <tr key={grant.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {grant.businessName}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                          {grant.scope}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            grant.isActiveNow
                              ? "bg-emerald-100 text-emerald-800"
                              : grant.status === "PENDING"
                              ? "bg-purple-100 text-purple-800"
                              : grant.status === "REJECTED"
                              ? "bg-red-100 text-red-800"
                              : grant.status === "REVOKED"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {grant.isActiveNow ? "ACTIVE" : grant.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate" title={grant.reason}>
                        &quot;{grant.reason}&quot;
                        {grant.rejectionReason && (
                          <div className="text-[10px] text-red-600">Rejection: {grant.rejectionReason}</div>
                        )}
                        {grant.revocationReason && (
                          <div className="text-[10px] text-amber-700">Revoked: {grant.revocationReason}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-[11px] text-slate-400">
                        {new Date(grant.createdAt).toLocaleDateString()} {new Date(grant.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: AUDIT (Platform audit stream: business, subscription, support, settings) */}
      {/* ========================================================================= */}
      {activeTab === "AUDIT" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">Platform Security & Governance Audit</h2>
              <p className="text-xs text-slate-500">
                Immutable record of administrative interventions, status changes, grants, and settings.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search description, operator..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="min-h-[38px] rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <select
                value={auditFilterEventType}
                onChange={(e) => setAuditFilterEventType(e.target.value)}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
              >
                <option value="ALL">All Event Types</option>
                <option value="BUSINESS_STATUS_CHANGED">Business Status</option>
                <option value="SUBSCRIPTION_STATUS_CHANGED">Subscription Status</option>
                <option value="SUPPORT_REQUEST_SUBMITTED">Support Requested</option>
                <option value="SUPPORT_REQUEST_APPROVED">Support Approved</option>
                <option value="SUPPORT_REQUEST_REJECTED">Support Rejected</option>
                <option value="SUPPORT_ACCESS_REVOKED">Support Revoked</option>
                <option value="PLATFORM_SETTINGS_CHANGED">Platform Settings</option>
              </select>
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredAudits.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
                No audit events matching current criteria.
              </div>
            ) : (
              filteredAudits.map((log) => (
                <div key={log.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1.5 hover:border-slate-300 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-slate-900 text-white px-2 py-0.5 text-[10px] font-black tracking-wide">
                        {log.eventType}
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        {log.actorRole === "PLATFORM_ADMIN" ? "Platform Admin" : "Tenant Operator"}: {log.actorName}
                      </span>
                      {log.businessId > 0 && (
                        <span className="text-[11px] text-slate-500 font-medium">
                          • Tenant #{log.businessId}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium">
                      {new Date(log.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <p className="text-xs text-slate-800 leading-relaxed font-normal">
                    {log.description}
                  </p>

                  {(log.oldValue || log.newValue || log.reason) && (
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-500 border-t border-slate-100">
                      {log.oldValue && log.newValue && (
                        <div>
                          Diff: <span className="line-through text-slate-400">{log.oldValue}</span> → <span className="font-bold text-slate-800">{log.newValue}</span>
                        </div>
                      )}
                      {log.reason && (
                        <div>
                          Reason: <span className="italic text-slate-700">&quot;{log.reason}&quot;</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: SETTINGS (Platform-wide configuration) */}
      {/* ========================================================================= */}
      {activeTab === "SETTINGS" && (
        <div className="max-w-2xl space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">Platform Operational Parameters</h2>
            <p className="text-xs text-slate-500">
              Fleet-wide controls applied across all tenant shops and customer onboarding flows.
            </p>
          </div>

          <form onSubmit={handleSaveSettings} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
            {/* Maintenance Mode */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="font-bold text-slate-900 text-sm">Platform Maintenance Mode</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  When enabled, tenants are alerted that maintenance is in progress and non-critical operations are gated.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settingsForm.maintenanceMode}
                onChange={(e) => setSettingsForm({ ...settingsForm, maintenanceMode: e.target.checked })}
                className="h-5 w-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 mt-1 cursor-pointer"
              />
            </div>

            {/* Maintenance Notice */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Custom Maintenance Notice Message
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Scheduled database maintenance in progress until 04:00 GMT."
                value={settingsForm.maintenanceNotice || ""}
                onChange={(e) => setSettingsForm({ ...settingsForm, maintenanceNotice: e.target.value })}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
              {/* Default Trial Duration */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Default Trial Duration (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={settingsForm.defaultTrialDays}
                  onChange={(e) => setSettingsForm({ ...settingsForm, defaultTrialDays: Number(e.target.value) })}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-900"
                />
              </div>

              {/* Grace Period Duration */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Subscription Grace Period (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={settingsForm.gracePeriodDays}
                  onChange={(e) => setSettingsForm({ ...settingsForm, gracePeriodDays: Number(e.target.value) })}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-900"
                />
              </div>
            </div>

            {/* Allow Self Registration */}
            <div className="flex items-start justify-between gap-4 border-t border-slate-100 pt-4">
              <div>
                <div className="font-bold text-slate-900 text-sm">Allow Self-Registration for New Businesses</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Allows prospective wholesaler proprietors to self-register and initiate 14-day trials.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settingsForm.allowSelfRegistration}
                onChange={(e) => setSettingsForm({ ...settingsForm, allowSelfRegistration: e.target.checked })}
                className="h-5 w-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 mt-1 cursor-pointer"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={isSavingSettings}
                className="rounded-xl bg-slate-950 px-6 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
              >
                {isSavingSettings ? "Saving Settings..." : "Save Platform Settings"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CHANGE BUSINESS STATE (Suspend / Restrict / Restore) */}
      {/* ========================================================================= */}
      {stateModalOpen && selectedBizForState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white font-black">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Change Business State</h3>
                  <p className="text-xs text-slate-500">{selectedBizForState.name}</p>
                </div>
              </div>
              <button
                onClick={() => setStateModalOpen(false)}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateBusinessState} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Target State
                </label>
                <select
                  value={targetState}
                  onChange={(e: any) => setTargetState(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-900 bg-white"
                >
                  <option value="ACTIVE">ACTIVE — Normal Operations Restored</option>
                  <option value="RESTRICTED">RESTRICTED — Read-Only Mode (Grace Period Exceeded)</option>
                  <option value="SUSPENDED">SUSPENDED — Full Block (Security / Non-Payment)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mandatory Justification Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Account suspended due to non-payment of subscription after 7-day grace period."
                  value={stateChangeReason}
                  onChange={(e) => setStateChangeReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900"
                />
              </div>

              <div className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-900 border border-amber-200">
                This intervention will immediately update tenant capabilities and log a high-severity security audit event.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStateModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingState || !stateChangeReason.trim()}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isSubmittingState ? "Updating..." : "Commit State Change"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: MANAGE SUBSCRIPTION (Plan, Status, Extend Trial) */}
      {/* ========================================================================= */}
      {subModalOpen && selectedSubBiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Manage Tenant Subscription</h3>
                  <p className="text-xs text-slate-500">{selectedSubBiz.name}</p>
                </div>
              </div>
              <button
                onClick={() => setSubModalOpen(false)}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSubscription} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Subscription Plan
                  </label>
                  <select
                    value={subPlan}
                    onChange={(e) => setSubPlan(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-900"
                  >
                    <option value="TRIAL">Trial</option>
                    <option value="STANDARD">Standard (₦15k)</option>
                    <option value="PRO">Pro (₦35k)</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Subscription Status
                  </label>
                  <select
                    value={subStatus}
                    onChange={(e) => setSubStatus(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-900"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="TRIAL">In Trial</option>
                    <option value="PAST_DUE">Past Due</option>
                    <option value="GRACE_PERIOD">Grace Period</option>
                    <option value="RESTRICTED">Restricted</option>
                    <option value="SUSPENDED">Suspended</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Extend Trial (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={extendDays}
                  onChange={(e) => setExtendDays(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Intervention Reason
                </label>
                <input
                  type="text"
                  placeholder="e.g. Courtesy 14-day trial extension requested by proprietor."
                  value={subChangeReason}
                  onChange={(e) => setSubChangeReason(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSubModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSub}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isSubmittingSub ? "Saving..." : "Save Subscription"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: REJECT SUPPORT REQUEST */}
      {/* ========================================================================= */}
      {reviewModalOpen && selectedGrantForReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 text-red-700 font-bold">
                  <Ban className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Reject Support Request</h3>
                  <p className="text-xs text-slate-500">For {selectedGrantForReview.businessName}</p>
                </div>
              </div>
              <button
                onClick={() => setReviewModalOpen(false)}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRejectSupportRequest} className="mt-4 space-y-4">
              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 border border-slate-200">
                <div className="font-bold text-slate-900">Original Request Reason:</div>
                <div className="mt-1 italic">&quot;{selectedGrantForReview.reason}&quot;</div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Rejection Reason * (Visible to shop owner)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Issue can be resolved self-service via the WhatsApp Assistant Settings view without platform elevation."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview || !rejectionReason.trim()}
                  className="rounded-xl bg-red-700 px-5 py-2 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50"
                >
                  {isSubmittingReview ? "Rejecting..." : "Confirm Rejection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DIRECT EMERGENCY SUPPORT GRANT CREATION */}
      {/* ========================================================================= */}
      {directSupportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-slate-950 font-black">
                  <Headphones className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Authorize Platform Support Session</h3>
                  <p className="text-xs text-slate-500">Direct operator ticket issuance</p>
                </div>
              </div>
              <button
                onClick={() => setDirectSupportModalOpen(false)}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDirectSupport} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Select Target Business *
                </label>
                <select
                  required
                  value={directSupportBizId}
                  onChange={(e) => setDirectSupportBizId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-900 bg-white"
                >
                  <option value="">-- Choose Tenant Shop --</option>
                  {(data?.businesses || []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} (Tenant #{b.id} • {b.owner?.fullName || "No owner"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ticket Reason / Documentation *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Inbound phone ticket #4092: Owner requested manual stock delta verification."
                  value={directSupportReason}
                  onChange={(e) => setDirectSupportReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Access Scope
                  </label>
                  <select
                    value={directSupportScope}
                    onChange={(e: any) => setDirectSupportScope(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-900 bg-white"
                  >
                    <option value="ACCOUNT_WHATSAPP">Account & WhatsApp Linking</option>
                    <option value="CATALOG_DIAGNOSTICS">Catalog Diagnostics</option>
                    <option value="DEBT_RECONCILIATION">Debt Reconciliation</option>
                    <option value="SYSTEM_CONFIG">System Configuration</option>
                    <option value="READ_ONLY">Read-Only Diagnostics</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Duration
                  </label>
                  <select
                    value={directSupportDuration}
                    onChange={(e) => setDirectSupportDuration(Number(e.target.value))}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-900 bg-white"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={60}>1 Hour</option>
                    <option value={120}>2 Hours</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-900 border border-amber-200">
                Granting support writes an immutable security audit event with your operator ID and justification.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDirectSupportModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDirectSupport || !directSupportBizId || !directSupportReason.trim()}
                  className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  {isSubmittingDirectSupport ? "Authorizing..." : "Authorize Grant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: INSPECT TENANT ARCHITECTURE & HIGH-LEVEL METADATA */}
      {/* ========================================================================= */}
      {inspectingBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-slate-950 font-black">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">{inspectingBusiness.name}</h3>
                  <p className="text-xs text-slate-500">Tenant #{inspectingBusiness.id} • Architecture Inspection</p>
                </div>
              </div>
              <button
                onClick={() => setInspectingBusiness(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* High-level Operational Metadata */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Operational Metadata (High-Level Aggregates Only)
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                  <div className="text-slate-500 text-[10px] font-bold uppercase">Products Catalog</div>
                  <div className="text-lg font-black text-slate-900 mt-0.5">{inspectingBusiness.counts?.products || 0}</div>
                  <div className="text-[10px] text-slate-400">SKUs tracked</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                  <div className="text-slate-500 text-[10px] font-bold uppercase">Customers / Debtors</div>
                  <div className="text-lg font-black text-slate-900 mt-0.5">{inspectingBusiness.counts?.customers || 0}</div>
                  <div className="text-[10px] text-slate-400">Ledger profiles</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                  <div className="text-slate-500 text-[10px] font-bold uppercase">Stock Ledger Entries</div>
                  <div className="text-lg font-black text-slate-900 mt-0.5">{inspectingBusiness.counts?.stockLedgerEntries || 0}</div>
                  <div className="text-[10px] text-slate-400">Audit-proof rows</div>
                </div>
              </div>
            </div>

            {/* Owner Identity */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1 text-xs">
              <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Business Proprietor</div>
              {inspectingBusiness.owner ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-1">
                  <div>
                    <div className="font-black text-slate-900 text-sm">{inspectingBusiness.owner.fullName}</div>
                    <div className="text-slate-600">{inspectingBusiness.owner.email}</div>
                  </div>
                  {inspectingBusiness.owner.phone && (
                    <div className="text-slate-500 flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      <span>{inspectingBusiness.owner.phone}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-slate-500 italic">No owner user assigned</div>
              )}
            </div>

            {/* Staff Members */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  Staff Roster ({inspectingBusiness.staffMembers.length})
                </span>
                <span className="text-[11px] text-slate-500">Delegated operators</span>
              </div>

              {inspectingBusiness.staffMembers.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500 border border-slate-200">
                  No staff operators currently linked to this tenant.
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden text-xs">
                  {inspectingBusiness.staffMembers.map((staff) => (
                    <div key={staff.id} className="p-2.5 flex items-center justify-between bg-white">
                      <div>
                        <div className="font-bold text-slate-900">{staff.fullName}</div>
                        <div className="text-[11px] text-slate-500">{staff.email}</div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          staff.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {staff.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Security Boundary Notice */}
            <div className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-950 border border-amber-200">
              <span className="font-bold">Zero Casual Access Boundary:</span> Platform Admin inspection is restricted to high-level system metadata. Sensitive financial totals, purchase costs, contractor debt balances, and user passwords remain isolated behind explicit Support Access Grants.
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setInspectingBusiness(null)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
