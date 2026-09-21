"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import {
  FileText,
  Calendar,
  TrendingDown,
  TrendingUp,
  DollarSign,
  AlertCircle,
  Truck,
  Scale,
  CreditCard,
  Users,
  Clock,
  Sparkles,
  HelpCircle,
  Info,
  Receipt,
  Lock,
  ArrowRight,
} from "lucide-react";

export function ReportsView() {
  const {
    weeklyReport,
    reportPeriodDays,
    setReportPeriodDays,
    openRecordPayment,
    isOwner,
  } = useStock();

  const [showProfitWhy, setShowProfitWhy] = useState(false);
  const metrics = weeklyReport?.metrics;

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Business Performance & Profit
            </h2>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
              {reportPeriodDays === 7 ? "Weekly" : reportPeriodDays === 30 ? "Monthly" : `${reportPeriodDays} Days`}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Answers human business questions with full traceability back to transactions.
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1 self-start sm:self-auto">
          {[
            { label: "Past 7 Days", days: 7 },
            { label: "Past 14 Days", days: 14 },
            { label: "Past 30 Days", days: 30 },
          ].map((item) => (
            <button
              key={item.days}
              onClick={() => setReportPeriodDays(item.days)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                reportPeriodDays === item.days
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {metrics ? (
        <div className="space-y-6">
          {/* "WHAT CHANGED THIS WEEK?" (Section 5) */}
          {metrics.comparison && metrics.comparison.summaryStatements.length > 0 && (
            <div className="rounded-3xl border border-blue-200 bg-linear-to-r from-blue-50/90 via-white to-blue-50/50 p-4 sm:p-5 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-700" />
                  <h3 className="text-sm font-bold text-slate-900">
                    What Changed This Week? (vs. Prior {reportPeriodDays} Days)
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
                  Grounded in Records
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {metrics.comparison.summaryStatements.map((stmt, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-xl bg-white p-2.5 border border-blue-100 shadow-2xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" />
                    <span className="font-semibold text-slate-800">{stmt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Executive KPI Grid: Cash Collected, Sales, Money Spent, Estimated Profit */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. How much did I sell? */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                How Much Did I Sell?
              </span>
              <div className="mt-1 text-xl sm:text-2xl font-black text-slate-900">
                ₦{metrics.totalSalesValue.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {metrics.salesCount} sale events
              </div>
            </div>

            {/* 2. How much money did I collect? */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                Money Collected
              </span>
              <div className="mt-1 text-xl sm:text-2xl font-black text-emerald-700">
                ₦{metrics.cashCollected.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-emerald-800">
                Cash from sales + debt recovered
              </div>
            </div>

            {/* 3. How much did I spend? */}
            <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4 shadow-xs">
              <span className="text-[11px] font-bold text-orange-800 uppercase tracking-wider">
                Money Spent
              </span>
              <div className="mt-1 text-xl sm:text-2xl font-black text-orange-700">
                {isOwner ? `₦${metrics.totalMoneySpent.toLocaleString()}` : "Restricted"}
              </div>
              <div className="mt-1 text-xs text-orange-800">
                {isOwner
                  ? `₦${metrics.restockExpenditure.toLocaleString()} stock + ₦${metrics.operatingExpenses.toLocaleString()} expenses`
                  : "Confidential to owner"}
              </div>
            </div>

            {/* 4. How much profit did I make? ("Why?" Explainability Card) */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs relative">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
                  Estimated Profit
                </span>
                {isOwner && (
                  <button
                    onClick={() => setShowProfitWhy(!showProfitWhy)}
                    className="flex items-center gap-0.5 text-[10px] font-bold text-amber-800 underline"
                  >
                    <span>Why?</span>
                    <Info className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="mt-1 text-xl sm:text-2xl font-black text-amber-950">
                {!isOwner ? (
                  <span className="text-sm font-bold text-slate-500 flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5" /> Confidential
                  </span>
                ) : metrics.estimatedProfit !== null ? (
                  `₦${metrics.estimatedProfit.toLocaleString()}`
                ) : (
                  <span className="text-sm font-bold text-amber-800">Incomplete data</span>
                )}
              </div>

              <div className="mt-1 text-xs text-amber-800">
                {!isOwner
                  ? "Owner access only"
                  : metrics.isProfitReliable
                  ? "Sales - Cost of Goods - Expenses"
                  : "Some purchase costs missing"}
              </div>
            </div>
          </div>

          {/* "Why?" Profit Calculation Traceability Card */}
          {isOwner && showProfitWhy && metrics.profitBreakdown && (
            <div className="rounded-3xl border border-amber-300 bg-linear-to-b from-amber-50/80 to-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black text-amber-950 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-700" />
                  <span>How SISPA Calculated Your Estimated Profit:</span>
                </h4>
                <button
                  onClick={() => setShowProfitWhy(false)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded-xl bg-white p-3 border border-amber-200">
                  <div className="text-slate-500 font-semibold">1. Total Sales</div>
                  <div className="text-base font-black text-slate-900">
                    +₦{metrics.profitBreakdown.sales.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3 border border-amber-200">
                  <div className="text-slate-500 font-semibold">2. Cost of Goods (COGS)</div>
                  <div className="text-base font-black text-red-700">
                    -₦{metrics.profitBreakdown.costOfGoods.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3 border border-amber-200">
                  <div className="text-slate-500 font-semibold">3. Operating Expenses</div>
                  <div className="text-base font-black text-orange-700">
                    -₦{metrics.profitBreakdown.expenses.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 border border-emerald-300">
                  <div className="text-emerald-900 font-bold">4. Net Profit</div>
                  <div className="text-base font-black text-emerald-800">
                    =₦{metrics.profitBreakdown.netProfit.toLocaleString()}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-600">
                Cost of goods is calculated from the authoritative unit purchase costs logged during delivery arrivals.
              </p>
            </div>
          )}

          {/* Data Confidence Notice (Honest Messaging Rule 11) */}
          {isOwner && metrics.profitConfidenceWarning && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Honest Data Notice:</p>
                <p className="mt-0.5 text-amber-800">{metrics.profitConfidenceWarning}</p>
              </div>
            </div>
          )}

          {/* Stock Check Recency Alert */}
          {metrics.stockCheckWarning && (
            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-3.5 text-xs text-purple-900 flex items-start gap-2.5">
              <Scale className="h-4 w-4 text-purple-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Physical Stock Accuracy:</p>
                <p className="mt-0.5 text-purple-800">{metrics.stockCheckWarning}</p>
              </div>
            </div>
          )}

          {/* Section: Who Still Owes Us? (Debt & Collections) */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-red-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Who Still Owes Us? (Customer Debt Movement)
                </h3>
              </div>
              <span className="text-xs text-slate-500">Over past {reportPeriodDays} days</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-500">New Credit Issued</div>
                <div className="text-lg font-black text-red-700">
                  ₦{metrics.newCreditIssued.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Goods taken on credit</div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-500">Debt Recovered</div>
                <div className="text-lg font-black text-emerald-700">
                  ₦{metrics.debtRecovered.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Cash payments collected</div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-500">Total Customer Debt Now</div>
                <div className="text-lg font-black text-slate-900">
                  ₦{metrics.closingDebt.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Pending collection</div>
              </div>
            </div>

            {/* Top Debtors Table */}
            {weeklyReport?.topDebtors && weeklyReport.topDebtors.length > 0 && (
              <div className="pt-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Top Debtors Needing Collection
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
                  {weeklyReport.topDebtors.slice(0, 5).map((debtor) => (
                    <div key={debtor.id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50">
                      <div>
                        <span className="font-bold text-slate-900">{debtor.name}</span>
                        {debtor.phone && <span className="text-slate-400 ml-2">({debtor.phone})</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-red-700">
                          ₦{debtor.outstandingBalance.toLocaleString()}
                        </span>
                        <button
                          onClick={() => openRecordPayment(debtor)}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                        >
                          Collect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section: What Needs Buying & Stock Accuracy */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">
                  What Needs Buying & Stock Accuracy
                </h3>
              </div>
              <span className="text-xs text-slate-500">Over past {reportPeriodDays} days</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-500">Deliveries Received</div>
                <div className="text-lg font-black text-slate-900">
                  {metrics.totalDeliveriesReceived} shipments
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Physical goods arrived</div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-500">Money Spent on Restocks</div>
                <div className="text-lg font-black text-amber-900">
                  {isOwner ? `₦${metrics.restockExpenditure.toLocaleString()}` : "Restricted"}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {isOwner ? "Recorded purchase prices" : "Confidential"}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-500">Stock Checks Logged</div>
                <div className="text-lg font-black text-slate-900">
                  {metrics.adjustmentsCount} adjustments
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Discrepancies reconciled</div>
              </div>
            </div>

            {/* Urgent stock banner */}
            {weeklyReport?.urgentStockItems && weeklyReport.urgentStockItems.length > 0 && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-950">
                <div className="font-bold flex items-center gap-1.5 mb-1 text-red-900">
                  <AlertCircle className="h-4 w-4" />
                  <span>{weeklyReport.urgentStockItems.length} Products Require Immediate Buying:</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {weeklyReport.urgentStockItems.map((p) => (
                    <span key={p.id} className="rounded-lg bg-white px-2.5 py-1 font-bold text-red-800 border border-red-200">
                      {p.name}: {p.currentStock} {p.unit} left (Buy: {p.intelligence.suggestedPurchaseQuantity})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="py-12 text-center text-xs text-slate-500">
          Loading report data...
        </div>
      )}
    </div>
  );
}
