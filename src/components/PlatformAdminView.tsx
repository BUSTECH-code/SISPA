"use client";

import React, { useEffect, useState } from "react";
import { useStock } from "@/context/StockContext";
import {
  ShieldAlert,
  Building2,
  Users,
  CreditCard,
  Key,
  CheckCircle,
  AlertTriangle,
  Clock,
  Search,
  RefreshCw,
  ExternalLink,
  Shield,
  FileText,
  Lock,
} from "lucide-react";

interface PlatformBusiness {
  id: number;
  name: string;
  currency: string;
  state: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  createdAt: string;
  owner: { id: number; fullName: string; email: string } | null;
  memberCount: number;
  hasActiveSupportGrant: boolean;
  activeSupportGrant: any | null;
}

interface PlatformOverviewData {
  stats: {
    totalBusinesses: number;
    activeBusinesses: number;
    trialSubscriptions: number;
    activeSubscriptions: number;
    totalUsersCount: number;
    totalStaffCount: number;
  };
  businesses: PlatformBusiness[];
  recentSupportGrants: any[];
}

export function PlatformAdminView() {
  const { user } = useStock();
  const [data, setData] = useState<PlatformOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");

  // Support Grant Modal
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<PlatformBusiness | null>(null);
  const [grantReason, setGrantReason] = useState("");
  const [grantScope, setGrantScope] = useState<"READ_ONLY" | "FULL">("READ_ONLY");
  const [grantDuration, setGrantDuration] = useState("30");
  const [isSubmittingGrant, setIsSubmittingGrant] = useState(false);

  // Subscription Modal
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [selectedSubBiz, setSelectedSubBiz] = useState<PlatformBusiness | null>(null);
  const [subPlan, setSubPlan] = useState("STANDARD");
  const [subStatus, setSubStatus] = useState("ACTIVE");
  const [extendDays, setExtendDays] = useState("0");
  const [isSubmittingSub, setIsSubmittingSub] = useState(false);

  const fetchOverview = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/overview");
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || "Failed to load platform data.");
      }
    } catch {
      setError("Network error fetching platform statistics.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleCreateGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusiness || !grantReason.trim()) return;

    setIsSubmittingGrant(true);
    try {
      const res = await fetch("/api/admin/support-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: selectedBusiness.id,
          reason: grantReason.trim(),
          scope: grantScope,
          durationMinutes: Number(grantDuration) || 30,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setGrantModalOpen(false);
        setGrantReason("");
        await fetchOverview();
      } else {
        alert(json.error || "Failed to grant support access.");
      }
    } catch {
      alert("Network error creating support grant.");
    } finally {
      setIsSubmittingGrant(false);
    }
  };

  const handleRevokeGrant = async (grantId: number) => {
    if (!confirm("Revoke this support access session immediately?")) return;
    try {
      const res = await fetch("/api/admin/support-grant", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchOverview();
      } else {
        alert(json.error || "Failed to revoke grant.");
      }
    } catch {
      alert("Network error revoking grant.");
    }
  };

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
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSubModalOpen(false);
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

  const filteredBusinesses = (data?.businesses || []).filter((b) => {
    const matchesSearch =
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.owner?.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.owner?.fullName || "").toLowerCase().includes(searchTerm.toLowerCase());

    if (filterStatus === "ALL") return matchesSearch;
    if (filterStatus === "ACTIVE") return matchesSearch && b.subscriptionStatus === "ACTIVE";
    if (filterStatus === "TRIAL") return matchesSearch && b.subscriptionStatus === "TRIAL";
    if (filterStatus === "PAST_DUE") return matchesSearch && b.subscriptionStatus === "PAST_DUE";
    return matchesSearch;
  });

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner */}
      <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-slate-950 font-black shadow-md">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Platform Operations Console
                </h1>
                <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-bold text-amber-300 border border-amber-400/30">
                  Platform Admin
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400">
                SaaS tenant isolation, subscription governance, and scoped support access auditing.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchOverview}
              disabled={isLoading}
              className="flex min-h-[42px] items-center gap-2 rounded-xl bg-slate-800 px-4 text-xs font-bold text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-amber-400" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800">
          {error}
        </div>
      )}

      {/* Metrics Row */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Building2 className="h-4 w-4 text-amber-600" />
              <span>Tenants</span>
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900">
              {data.stats.totalBusinesses}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-slate-500">
              {data.stats.activeBusinesses} Active shops
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Clock className="h-4 w-4 text-blue-600" />
              <span>Trial Plans</span>
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900">
              {data.stats.trialSubscriptions}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-slate-500">14-day trials</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <CreditCard className="h-4 w-4 text-emerald-600" />
              <span>Subscribed</span>
            </div>
            <div className="mt-2 text-2xl font-black text-emerald-700">
              {data.stats.activeSubscriptions}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-slate-500">Active commercial</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Users className="h-4 w-4 text-purple-600" />
              <span>Total Users</span>
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900">
              {data.stats.totalUsersCount}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-slate-500">Owners & Staff</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Users className="h-4 w-4 text-indigo-600" />
              <span>Staff Accts</span>
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900">
              {data.stats.totalStaffCount}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-slate-500">Invited staff</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Key className="h-4 w-4 text-amber-700" />
              <span>Active Grants</span>
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900">
              {data.recentSupportGrants.filter((g) => !g.revokedAt && new Date(g.expiresAt) > new Date()).length}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-slate-500">Support sessions</div>
          </div>
        </div>
      )}

      {/* Security Rule Card */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
        <div className="flex items-start gap-2.5">
          <Lock className="h-4 w-4 shrink-0 text-amber-800 mt-0.5" />
          <div>
            <span className="font-bold">Strict Platform Admin Isolation Mandate: </span>
            Platform Admins do not possess casual, un-audited access to a business owner&apos;s inventory, sales, or customer financial records.
            To assist a business owner with diagnostic troubleshooting, an explicit, short-lived, reasoned support access grant must be recorded below.
          </div>
        </div>
      </div>

      {/* Business Tenants Section */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Customer Business Tenants</h3>
            <p className="text-xs text-slate-500">All registered wholesaler and distributor shops.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search shop or owner..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="min-h-[38px] rounded-xl border border-slate-200 pl-8 pr-3 text-xs font-medium text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Subscription</option>
              <option value="TRIAL">In Free Trial</option>
              <option value="PAST_DUE">Past Due</option>
            </select>
          </div>
        </div>

        {/* Businesses Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Business Name</th>
                <th className="py-3 px-4">Owner</th>
                <th className="py-3 px-4">Plan & Status</th>
                <th className="py-3 px-4">Members</th>
                <th className="py-3 px-4">Support Status</th>
                <th className="py-3 px-4 text-right">Administrative Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBusinesses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No businesses matching your search.
                  </td>
                </tr>
              ) : (
                filteredBusinesses.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{b.name}</div>
                      <div className="text-[11px] text-slate-500">Tenant #{b.id} • {b.currency}</div>
                    </td>
                    <td className="py-3 px-4">
                      {b.owner ? (
                        <div>
                          <div className="font-semibold text-slate-800">{b.owner.fullName}</div>
                          <div className="text-[11px] text-slate-500">{b.owner.email}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">None assigned</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800">{b.subscriptionPlan}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            b.subscriptionStatus === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800"
                              : b.subscriptionStatus === "TRIAL"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {b.subscriptionStatus}
                        </span>
                      </div>
                      {b.trialEndsAt && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Trial ends {new Date(b.trialEndsAt).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {b.memberCount} active
                    </td>
                    <td className="py-3 px-4">
                      {b.hasActiveSupportGrant ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                          <Key className="h-3 w-3" />
                          <span>Active Grant</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                          <Lock className="h-3 w-3" />
                          <span>Isolated</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedBusiness(b);
                            setGrantModalOpen(true);
                          }}
                          className="flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Key className="h-3.5 w-3.5 text-amber-700" />
                          <span>Support Grant</span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedSubBiz(b);
                            setSubPlan(b.subscriptionPlan);
                            setSubStatus(b.subscriptionStatus);
                            setSubModalOpen(true);
                          }}
                          className="flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                          <CreditCard className="h-3.5 w-3.5 text-slate-500" />
                          <span>Subscription</span>
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

      {/* Active & Recent Support Access Logs */}
      {data && data.recentSupportGrants.length > 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Support Access Audit Trail</h3>
              <p className="text-xs text-slate-500">
                All time-limited support permissions granted to platform personnel.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
              {data.recentSupportGrants.length} logs
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {data.recentSupportGrants.map((grant: any) => {
              const isExpired = new Date(grant.expiresAt) <= new Date();
              const isRevoked = !!grant.revokedAt;
              const isActive = !isExpired && !isRevoked;

              return (
                <div key={grant.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">
                        Business #{grant.businessId}
                      </span>
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700">
                        Scope: {grant.scope}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isActive
                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                            : isRevoked
                            ? "bg-slate-100 text-slate-500 line-through"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {isActive ? "ACTIVE SESSION" : isRevoked ? "REVOKED" : "EXPIRED"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Reason: <span className="font-medium italic text-slate-800">&quot;{grant.reason}&quot;</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Granted: {new Date(grant.createdAt).toLocaleString()} • Expires: {new Date(grant.expiresAt).toLocaleTimeString()}
                    </div>
                  </div>

                  {isActive && (
                    <button
                      onClick={() => handleRevokeGrant(grant.id)}
                      className="self-start sm:self-center flex min-h-[34px] items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      <span>Revoke Session</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grant Support Modal */}
      {grantModalOpen && selectedBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 text-white">
                  <Key className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Issue Support Access Grant</h3>
                  <p className="text-xs text-slate-500">For {selectedBusiness.name}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleCreateGrant} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Justification / Support Ticket Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g., Shop owner requested assistance reconciling stock ledger discrepancy."
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Access Scope
                  </label>
                  <select
                    value={grantScope}
                    onChange={(e: any) => setGrantScope(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-900"
                  >
                    <option value="READ_ONLY">Read Only (Diagnostic)</option>
                    <option value="FULL">Full Support</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Duration
                  </label>
                  <select
                    value={grantDuration}
                    onChange={(e) => setGrantDuration(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-900"
                  >
                    <option value="15">15 Minutes</option>
                    <option value="30">30 Minutes</option>
                    <option value="60">1 Hour</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600 border border-slate-200">
                Granting access writes a high-severity security audit log with your operator ID and reason.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setGrantModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingGrant || !grantReason.trim()}
                  className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {isSubmittingGrant ? "Authorizing..." : "Authorize Grant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subscription Modal */}
      {subModalOpen && selectedSubBiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Manage Tenant Subscription</h3>
                  <p className="text-xs text-slate-500">For {selectedSubBiz.name}</p>
                </div>
              </div>
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
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-900"
                  >
                    <option value="TRIAL">Trial</option>
                    <option value="STANDARD">Standard</option>
                    <option value="PRO">Pro</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Account Status
                  </label>
                  <select
                    value={subStatus}
                    onChange={(e) => setSubStatus(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-900"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="TRIAL">In Trial</option>
                    <option value="PAST_DUE">Past Due</option>
                    <option value="GRACE_PERIOD">Grace Period</option>
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
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isSubmittingSub ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
