"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import { Navbar } from "./Navbar";
import { BottomNav } from "./BottomNav";
import { AttentionFeed } from "./AttentionFeed";
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

export function MainApp() {
  const { activeTab, isAuthenticated } = useStock();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans selection:bg-amber-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar />

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        {activeTab === "HOME" && <AttentionFeed />}
        {activeTab === "STOCK" && <StockListView />}
        {activeTab === "DEBT" && <CustomerDebtView />}
        {activeTab === "BUYING" && <BuyingListView />}
        {activeTab === "SUPPLIERS" && <SuppliersView />}
        {activeTab === "REPORTS" && <ReportsView />}
        {activeTab === "EXPENSES" && <ExpensesView />}
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
