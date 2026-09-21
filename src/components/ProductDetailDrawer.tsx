"use client";

import React, { useState, useEffect } from "react";
import { useStock } from "@/context/StockContext";
import type { StockLedgerEntry } from "@/db/schema";
import {
  X,
  TrendingDown,
  Truck,
  Scale,
  ShoppingCart,
  Calendar,
  History,
  Settings,
  AlertCircle,
  Check,
  Edit2,
  Trash2,
  Tag,
} from "lucide-react";

export function ProductDetailDrawer() {
  const {
    activeModal,
    selectedProduct,
    closeModal,
    openRecordSale,
    openRecordDelivery,
    openCountStock,
    addToBuyingList,
    refreshData,
  } = useStock();

  const [ledgerHistory, setLedgerHistory] = useState<StockLedgerEntry[]>([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);
  const [activeTab, setActiveTab] = useState<"HISTORY" | "SETTINGS">("HISTORY");

  // Editable settings
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [desiredCoverageDays, setDesiredCoverageDays] = useState("7");
  const [minimumStockThreshold, setMinimumStockThreshold] = useState("");
  const [manualDailySalesOverride, setManualDailySalesOverride] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    if (activeModal === "PRODUCT_DETAILS" && selectedProduct) {
      setName(selectedProduct.name);
      setCategory(selectedProduct.category);
      setUnit(selectedProduct.unit);
      setSellingPrice(selectedProduct.sellingPrice ? String(selectedProduct.sellingPrice) : "");
      setDesiredCoverageDays(String(selectedProduct.desiredCoverageDays));
      setMinimumStockThreshold(
        selectedProduct.minimumStockThreshold !== null
          ? String(selectedProduct.minimumStockThreshold)
          : ""
      );
      setManualDailySalesOverride(
        selectedProduct.manualDailySalesOverride !== null
          ? String(selectedProduct.manualDailySalesOverride)
          : ""
      );

      // Fetch full ledger history
      setIsLoadingLedger(true);
      fetch(`/api/products/${selectedProduct.id}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.success) {
            setLedgerHistory(json.data.ledgerHistory);
          }
        })
        .finally(() => setIsLoadingLedger(false));
    }
  }, [activeModal, selectedProduct]);

  if (activeModal !== "PRODUCT_DETAILS" || !selectedProduct) return null;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const res = await fetch(`/api/products/${selectedProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category: category.trim(),
          unit: unit.trim(),
          sellingPrice: sellingPrice ? Number(sellingPrice) : null,
          desiredCoverageDays: Number(desiredCoverageDays) || 7,
          minimumStockThreshold: minimumStockThreshold ? Number(minimumStockThreshold) : null,
          manualDailySalesOverride: manualDailySalesOverride
            ? Number(manualDailySalesOverride)
            : null,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSettingsSaved(true);
        await refreshData();
        setTimeout(() => setSettingsSaved(false), 2000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const { status, daysRemaining, velocity, suggestedPurchaseQuantity, explanation } =
    selectedProduct.intelligence;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl transition-all overflow-hidden">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">
          <div className="flex-1 min-w-0 pr-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {selectedProduct.category}
            </span>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 truncate">
              {selectedProduct.name}
            </h3>
          </div>
          <button
            onClick={closeModal}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quick Stock Summary Banner */}
        <div className="bg-slate-50/90 border-b border-slate-100 px-4 py-3 sm:px-6">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white p-2.5 border border-slate-200/80 shadow-2xs">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Current Stock</div>
              <div className="text-lg sm:text-xl font-black text-slate-900">
                {selectedProduct.currentStock}{" "}
                <span className="text-xs font-semibold text-slate-500">{selectedProduct.unit}</span>
              </div>
            </div>

            <div className="rounded-xl bg-white p-2.5 border border-slate-200/80 shadow-2xs">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Estimated Left</div>
              <div className="text-lg sm:text-xl font-black text-amber-800">
                {daysRemaining !== null
                  ? daysRemaining === Infinity
                    ? "Steady"
                    : `~${Math.round(daysRemaining)} days`
                  : "Calculating"}
              </div>
            </div>

            <div className="rounded-xl bg-white p-2.5 border border-slate-200/80 shadow-2xs">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Suggested Buy</div>
              <div className="text-lg sm:text-xl font-black text-emerald-800">
                {suggestedPurchaseQuantity > 0 ? `Buy ${suggestedPurchaseQuantity}` : "None"}
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between text-xs text-slate-600">
            <span>
              Selling price:{" "}
              <strong>
                {selectedProduct.sellingPrice
                  ? `₦${Number(selectedProduct.sellingPrice).toLocaleString()} / ${selectedProduct.unit}`
                  : "Not set"}
              </strong>
            </span>
            {selectedProduct.lastSupplierInfo && (
              <span>
                Last bought: <strong>₦{selectedProduct.lastSupplierInfo.unitCost?.toLocaleString() || "—"}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons Strip */}
        <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-4 py-2 sm:px-6 overflow-x-auto">
          <button
            onClick={() => {
              closeModal();
              openRecordSale(selectedProduct);
            }}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/60 px-3 text-xs font-bold text-red-800 hover:bg-red-100 transition-colors shrink-0"
          >
            <TrendingDown className="h-4 w-4 text-red-600" />
            <span>Record Sale</span>
          </button>

          <button
            onClick={() => {
              closeModal();
              openRecordDelivery(selectedProduct);
            }}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition-colors shrink-0"
          >
            <Truck className="h-4 w-4 text-emerald-600" />
            <span>Record Delivery</span>
          </button>

          <button
            onClick={() => {
              closeModal();
              openCountStock(selectedProduct);
            }}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/60 px-3 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors shrink-0"
          >
            <Scale className="h-4 w-4 text-amber-700" />
            <span>Count Stock</span>
          </button>

          <button
            onClick={() => addToBuyingList(selectedProduct)}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/60 px-3 text-xs font-bold text-blue-900 hover:bg-blue-100 transition-colors shrink-0"
          >
            <ShoppingCart className="h-4 w-4 text-blue-700" />
            <span>Buy List</span>
          </button>
        </div>

        {/* Tab Toggle: History vs Settings */}
        <div className="flex border-b border-slate-100 px-4 sm:px-6">
          <button
            onClick={() => setActiveTab("HISTORY")}
            className={`flex items-center gap-1.5 border-b-2 py-2.5 px-3 text-xs font-bold transition-colors ${
              activeTab === "HISTORY"
                ? "border-amber-600 text-amber-800"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <History className="h-4 w-4" />
            <span>Stock History ({ledgerHistory.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("SETTINGS")}
            className={`flex items-center gap-1.5 border-b-2 py-2.5 px-3 text-xs font-bold transition-colors ${
              activeTab === "SETTINGS"
                ? "border-amber-600 text-amber-800"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Settings className="h-4 w-4" />
            <span>Product & Price Settings</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === "HISTORY" ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                All stock additions and subtractions. Historical entries cannot be modified or deleted.
              </p>

              {isLoadingLedger ? (
                <div className="py-8 text-center text-xs text-slate-500">Loading history...</div>
              ) : ledgerHistory.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No stock entries recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {ledgerHistory.map((entry) => {
                    const delta = Number(entry.quantityDelta);
                    const isPositive = delta > 0;
                    const dateFormatted = new Date(entry.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <div key={entry.id} className="py-2.5 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5 ${
                              entry.entryType === "SALE"
                                ? "bg-red-100 text-red-700"
                                : entry.entryType === "RESTOCK"
                                ? "bg-emerald-100 text-emerald-700"
                                : entry.entryType === "ADJUSTMENT"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {entry.entryType === "SALE" && <TrendingDown className="h-4 w-4" />}
                            {entry.entryType === "RESTOCK" && <Truck className="h-4 w-4" />}
                            {entry.entryType === "ADJUSTMENT" && <Scale className="h-4 w-4" />}
                            {entry.entryType === "OPENING_BALANCE" && (
                              <Calendar className="h-4 w-4" />
                            )}
                          </div>

                          <div>
                            <div className="text-xs font-bold text-slate-900">
                              {entry.entryType === "SALE" && "Sale recorded"}
                              {entry.entryType === "RESTOCK" && "Delivery received"}
                              {entry.entryType === "ADJUSTMENT" && "Stock count adjustment"}
                              {entry.entryType === "OPENING_BALANCE" && "Initial opening balance"}
                            </div>
                            <div className="text-[11px] text-slate-500">{entry.notes || dateFormatted}</div>
                            {entry.supplierName && (
                              <div className="text-[10px] text-slate-500">
                                Supplier: <strong>{entry.supplierName}</strong>
                                {entry.unitCost && ` @ ₦${Number(entry.unitCost).toLocaleString()}`}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`text-sm font-black ${
                              isPositive ? "text-emerald-700" : delta < 0 ? "text-red-700" : "text-slate-700"
                            }`}
                          >
                            {isPositive ? `+${delta}` : delta} {selectedProduct.unit}
                          </span>
                          <div className="text-[10px] text-slate-400">{dateFormatted}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveSettings} className="space-y-4">
              {settingsSaved && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
                  <Check className="h-4 w-4 text-emerald-600" />
                  <span>Settings updated successfully!</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900"
                />
              </div>

              {/* Selling price - Authoritative record */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <label className="block text-xs font-bold text-emerald-950 mb-1 flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-emerald-700" />
                  <span>Shop Selling Price for one (₦)</span>
                </label>
                <input
                  type="number"
                  placeholder="e.g. 9200"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-900"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Authoritative selling price used when recording sales in shop and on WhatsApp.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unit of Measure</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Days of Stock to Keep
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={desiredCoverageDays}
                    onChange={(e) => setDesiredCoverageDays(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900"
                  />
                  <span className="text-[10px] text-slate-500">Coverage target</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Minimum Stock Level
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="None"
                    value={minimumStockThreshold}
                    onChange={(e) => setMinimumStockThreshold(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900"
                  />
                  <span className="text-[10px] text-slate-500">Alert threshold</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Manual Daily Sales Override (optional)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Auto-calculated from sales"
                  value={manualDailySalesOverride}
                  onChange={(e) => setManualDailySalesOverride(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-500">
                  Override automatic calculation if sales vary due to seasonality.
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 text-sm font-bold text-white shadow-md shadow-amber-600/30 hover:bg-amber-700 active:scale-98 transition-all disabled:opacity-50"
                >
                  <span>{isSavingSettings ? "Saving..." : "Save Changes"}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
