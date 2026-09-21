"use client";

import React, { useState } from "react";
import { useStock, type BuyingItem } from "@/context/StockContext";
import {
  ShoppingCart,
  CheckCircle2,
  Trash2,
  Plus,
  Truck,
  Check,
  Sparkles,
  ShoppingBag,
  Info,
  Lock,
} from "lucide-react";

export function BuyingListView() {
  const {
    buyingList,
    totalEstimatedOutlay,
    toggleBuyingItem,
    removeBuyingItem,
    clearCompletedBuyingItems,
    openRecordDelivery,
    products,
    addToBuyingList,
    setActiveTab,
    isOwner,
  } = useStock();

  const [selectedProductIdToAdd, setSelectedProductIdToAdd] = useState<string>("");
  const [customQtyToAdd, setCustomQtyToAdd] = useState<string>("10");
  const [showAddStrip, setShowAddStrip] = useState(false);
  const [selectedWhyProduct, setSelectedWhyProduct] = useState<number | null>(null);

  const pendingItems = buyingList.filter((i) => !i.isCompleted);
  const completedItems = buyingList.filter((i) => i.isCompleted);

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const prod = products.find((p) => p.id === Number(selectedProductIdToAdd));
    if (prod) {
      await addToBuyingList(prod, Number(customQtyToAdd) || 1);
      setShowAddStrip(false);
      setSelectedProductIdToAdd("");
    }
  };

  const handleDeliveryFromItem = (item: BuyingItem) => {
    const prod = products.find((p) => p.id === item.productId);
    if (prod) {
      openRecordDelivery(prod);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Buying List
            </h2>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
              {pendingItems.length} to buy
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Checklist for your supplier trips and market orders with clear explanations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddStrip(!showAddStrip)}
            className="flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Plus className="h-4 w-4 text-amber-600" />
            <span>Add Item</span>
          </button>

          {completedItems.length > 0 && (
            <button
              onClick={() => clearCompletedBuyingItems()}
              className="flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear Done ({completedItems.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Item form strip */}
      {showAddStrip && (
        <form
          onSubmit={handleAddCustom}
          className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3"
        >
          <div className="text-xs font-bold text-amber-950">Add product to your buying list:</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2">
              <select
                value={selectedProductIdToAdd}
                onChange={(e) => setSelectedProductIdToAdd(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
              >
                <option value="">Select a product to buy...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.currentStock} {p.unit} in stock)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                placeholder="Qty"
                value={customQtyToAdd}
                onChange={(e) => setCustomQtyToAdd(e.target.value)}
                className="w-24 min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900 text-center"
              />
              <button
                type="submit"
                disabled={!selectedProductIdToAdd}
                className="flex-1 min-h-[44px] rounded-xl bg-amber-600 px-3 text-xs font-bold text-white shadow-xs hover:bg-amber-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Outlay Total Card (Commercial Sensitivity: Hidden for staff if price restricted) */}
      {buyingList.length > 0 && (
        <div className="rounded-2xl bg-linear-to-br from-slate-900 via-slate-800 to-amber-950 p-5 text-white shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-300/90">
                Estimated Total Cash Outlay
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-white">
                  {isOwner ? `₦${totalEstimatedOutlay.toLocaleString()}` : "Confidential"}
                </span>
                <span className="text-xs text-slate-300">
                  for {pendingItems.length} pending items
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">
                {isOwner
                  ? "Based on your last recorded purchase prices."
                  : "Purchase pricing restricted to shop owner."}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Items List */}
      {buyingList.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 mb-3">
            <ShoppingCart className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Your buying list is empty</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Go to the Attention feed or your Stock catalog and tap &quot;Add to Buying List&quot; on any product you need to purchase.
          </p>
          <button
            onClick={() => setActiveTab("HOME")}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700"
          >
            <span>See What Needs Attention</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pending items */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              To Buy ({pendingItems.length})
            </h3>

            {pendingItems.length === 0 ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center text-xs font-semibold text-emerald-800">
                All items on your list have been bought!
              </div>
            ) : (
              pendingItems.map((item) => {
                const itemCost = item.estimatedUnitCost ? Number(item.estimatedUnitCost) : null;
                const lineTotal = itemCost ? itemCost * item.quantityToBuy : null;
                const matchingProd = products.find((p) => p.id === item.productId);
                const isWhyOpen = selectedWhyProduct === item.productId;

                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-amber-300"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => toggleBuyingItem(item.id, true)}
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-slate-300 hover:border-emerald-600 hover:bg-emerald-50 text-transparent hover:text-emerald-600 transition-colors"
                          title="Mark as bought"
                        >
                          <Check className="h-4 w-4 stroke-[3]" />
                        </button>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm sm:text-base font-bold text-slate-900">
                              {item.productName}
                            </h4>
                            <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {item.category}
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                            <span className="font-bold text-amber-900">
                              Buy: {item.quantityToBuy} {item.productUnit}
                            </span>
                            {isOwner && itemCost && (
                              <span className="text-slate-500">
                                ~₦{itemCost.toLocaleString()} each
                              </span>
                            )}
                            {item.supplierName && (
                              <span className="text-slate-500">
                                Supplier: <strong>{item.supplierName}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                        {isOwner && lineTotal !== null && (
                          <div className="text-left sm:text-right">
                            <div className="text-xs text-slate-400">Estimated</div>
                            <div className="text-sm sm:text-base font-black text-slate-900">
                              ₦{lineTotal.toLocaleString()}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          {matchingProd && (
                            <button
                              onClick={() => setSelectedWhyProduct(isWhyOpen ? null : item.productId)}
                              className="flex min-h-[38px] items-center gap-1 rounded-xl bg-slate-50 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200"
                              title="Why did SISPA suggest this purchase quantity?"
                            >
                              <Info className="h-3.5 w-3.5 text-amber-700" />
                              <span>Why Buy?</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleDeliveryFromItem(item)}
                            title="Record delivery arrival when goods reach shop"
                            className="flex min-h-[38px] items-center gap-1 rounded-xl bg-emerald-50 px-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                          >
                            <Truck className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Delivered</span>
                          </button>

                          <button
                            onClick={() => removeBuyingItem(item.id)}
                            title="Remove item"
                            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* "Why Buy?" Progressive Disclosure Explanation Box */}
                    {isWhyOpen && matchingProd && (
                      <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-slate-700 space-y-1.5">
                        <div className="font-bold text-amber-950 flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-amber-700" />
                          <span>Why SISPA Recommends Buying {item.quantityToBuy} {item.productUnit}:</span>
                        </div>
                        <ul className="space-y-1 text-[11px] text-slate-600">
                          <li>• <strong>Current stock:</strong> {matchingProd.currentStock} {matchingProd.unit} available in shop</li>
                          <li>
                            • <strong>Selling pace:</strong>{" "}
                            {matchingProd.intelligence.velocity !== null
                              ? `About ${Math.round(matchingProd.intelligence.velocity * 10) / 10} ${matchingProd.unit}/day`
                              : "Not enough sales history recorded yet"}
                          </li>
                          <li>• <strong>Target coverage:</strong> {matchingProd.desiredCoverageDays} days of shop stock</li>
                          <li>
                            • <strong>Time left:</strong>{" "}
                            {matchingProd.intelligence.daysRemaining !== null
                              ? matchingProd.intelligence.daysRemaining === Infinity
                                ? "Steady"
                                : `About ${Math.round(matchingProd.intelligence.daysRemaining)} days before running out`
                              : "Calculating"}
                          </li>
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Completed items */}
          {completedItems.length > 0 && (
            <div className="space-y-2.5 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Bought / Completed ({completedItems.length})
                </h3>
              </div>

              {completedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 opacity-75"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleBuyingItem(item.id, false)}
                      className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-white"
                      title="Mark as not completed"
                    >
                      <Check className="h-4 w-4 stroke-[3]" />
                    </button>
                    <div>
                      <span className="text-xs sm:text-sm font-semibold text-slate-600 line-through">
                        {item.productName} — Buy {item.quantityToBuy} {item.productUnit}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => removeBuyingItem(item.id)}
                    className="text-slate-400 hover:text-red-600 p-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
