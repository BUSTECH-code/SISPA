"use client";

import React from "react";
import { useStock } from "@/context/StockContext";
import { Navbar } from "./Navbar";
import { BottomNav } from "./BottomNav";
import { AttentionFeed } from "./AttentionFeed";
import { StaffHomeView } from "./StaffHomeView";
import { PlatformAdminView } from "./PlatformAdminView";
import { StockListView } from "./StockListView";
import { CustomerDebtView } from "./CustomerDebtView";
import { BuyingListView } from "./BuyingListView";
import { SuppliersView } from "./SuppliersView";
import { ReportsView } from "./ReportsView";
import { ExpensesView } from "./ExpensesView";
import { ActivityView } from "./ActivityView";
import { AuditTrailView } from "./AuditTrailView";
import { WhatsAppAssistantView } from "./WhatsAppAssistantView";
import { RecordSaleModal } from "./RecordSaleModal";
import { RecordDeliveryModal } from "./RecordDeliveryModal";
import { CountStockModal } from "./CountStockModal";
import { AddProductModal } from "./AddProductModal";
import { ProductDetailDrawer } from "./ProductDetailDrawer";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { RecordExpenseModal } from "./RecordExpenseModal";
import { StockCheckModal } from "./StockCheckModal";
import { DailyCashCheckModal } from "./DailyCashCheckModal";
import { StaffManagementModal } from "./StaffManagementModal";
import { UpdateDeliveryCostModal } from "./UpdateDeliveryCostModal";
import { SaleCorrectionModal } from "./SaleCorrectionModal";
import { AuthModal } from "./AuthModal";
import { ShieldAlert, ArrowRight } from "lucide-react";

function PlatformAdminZeroAccessGuard({
  onGoToConsole,
  sectionName,
}: {
  onGoToConsole: () => void;
  sectionName: string;
}) {
  return (
    <div className="mx-auto max-w-2xl py-12 px-4 text-center">
      <div className="rounded-3xl border border-amber-300 bg-amber-50/90 p-8 shadow-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 text-slate-950 font-black shadow-sm mb-4">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-200/80 px-3 py-1 text-xs font-bold text-amber-950 mb-3">
          Zero Casual Access Policy Enforced
        </div>
        <h2 className="text-xl font-black text-slate-900">
          Tenant Private {sectionName} Restricted
        </h2>
        <p className="mt-3 text-sm text-slate-700 leading-relaxed max-w-lg mx-auto">
          As a SISPA Platform Administrator, you cannot casually browse individual tenant inventory, selling prices, contractor credit ledgers, or commercial margins.
        </p>
        <p className="mt-2 text-xs text-slate-500 max-w-md mx-auto">
          To inspect a specific tenant shop for technical troubleshooting, you must record an auditable, time-limited Support Access Grant with a documented ticket number or customer request.
        </p>
        <div className="mt-6 flex justify-center">
          <button
            onClick={onGoToConsole}
            className="flex items-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-slate-800 transition-colors"
          >
            <span>Open Platform Operations Console</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function MainApp() {
  const { activeTab, setActiveTab, isAuthenticated, isOwner, user } = useStock();

  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans selection:bg-amber-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar />

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        {/* Platform Admin Console */}
        {activeTab === "PLATFORM_ADMIN" && <PlatformAdminView />}

        {/* Home Routing: Platform Admin -> Admin Console, Staff -> Staff Counter Desk, Owner -> Attention Feed */}
        {activeTab === "HOME" && (
          isPlatformAdmin ? (
            <PlatformAdminView />
          ) : !isOwner && isAuthenticated ? (
            <StaffHomeView />
          ) : (
            <AttentionFeed />
          )
        )}

        {/* Shop Operational Views with Platform Admin Zero Casual Access Guards */}
        {activeTab === "STOCK" && (
          isPlatformAdmin ? (
            <PlatformAdminZeroAccessGuard
              onGoToConsole={() => setActiveTab("PLATFORM_ADMIN")}
              sectionName="Stock & Inventory"
            />
          ) : (
            <StockListView />
          )
        )}

        {activeTab === "DEBT" && (
          isPlatformAdmin ? (
            <PlatformAdminZeroAccessGuard
              onGoToConsole={() => setActiveTab("PLATFORM_ADMIN")}
              sectionName="Customer Debts"
            />
          ) : (
            <CustomerDebtView />
          )
        )}

        {activeTab === "BUYING" && (
          isPlatformAdmin ? (
            <PlatformAdminZeroAccessGuard
              onGoToConsole={() => setActiveTab("PLATFORM_ADMIN")}
              sectionName="Buying Decisions"
            />
          ) : (
            <BuyingListView />
          )
        )}

        {activeTab === "SUPPLIERS" && (
          isPlatformAdmin ? (
            <PlatformAdminZeroAccessGuard
              onGoToConsole={() => setActiveTab("PLATFORM_ADMIN")}
              sectionName="Supplier Accounts"
            />
          ) : (
            <SuppliersView />
          )
        )}

        {activeTab === "REPORTS" && (
          isPlatformAdmin ? (
            <PlatformAdminZeroAccessGuard
              onGoToConsole={() => setActiveTab("PLATFORM_ADMIN")}
              sectionName="Financial Reports"
            />
          ) : (
            <ReportsView />
          )
        )}

        {activeTab === "EXPENSES" && (
          isPlatformAdmin ? (
            <PlatformAdminZeroAccessGuard
              onGoToConsole={() => setActiveTab("PLATFORM_ADMIN")}
              sectionName="Operating Expenses"
            />
          ) : (
            <ExpensesView />
          )
        )}

        {activeTab === "AUDIT" && <AuditTrailView />}
        {activeTab === "WHATSAPP" && <WhatsAppAssistantView />}
        {activeTab === "ACTIVITY" && <ActivityView />}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      {isAuthenticated && <BottomNav />}

      {/* All Operational Modals */}
      <RecordSaleModal />
      <RecordDeliveryModal />
      <CountStockModal />
      <AddProductModal />
      <ProductDetailDrawer />
      <RecordPaymentModal />
      <RecordExpenseModal />
      <StockCheckModal />
      <DailyCashCheckModal />
      <StaffManagementModal />
      <UpdateDeliveryCostModal />
      <SaleCorrectionModal />
      <AuthModal />
    </div>
  );
}

