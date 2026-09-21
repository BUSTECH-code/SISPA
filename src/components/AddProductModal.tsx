"use client";

import React, { useState } from "react";
import { useStock } from "@/context/StockContext";
import { PackagePlus, X, Check, AlertCircle, Tag } from "lucide-react";

export function AddProductModal() {
  const { activeModal, closeModal, refreshData } = useStock();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Cement & Aggregates");
  const [unit, setUnit] = useState("bags");
  const [sellingPrice, setSellingPrice] = useState("");
  const [desiredCoverageDays, setDesiredCoverageDays] = useState("7");
  const [minimumStockThreshold, setMinimumStockThreshold] = useState("");
  const [openingStock, setOpeningStock] = useState("");
  const [openingUnitCost, setOpeningUnitCost] = useState("");
  const [supplierName, setSupplierName] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (activeModal !== "ADD_PRODUCT") return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage("Please enter a product name.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category: category.trim(),
          unit: unit.trim(),
          sellingPrice: sellingPrice ? Number(sellingPrice) : null,
          desiredCoverageDays: Number(desiredCoverageDays) || 7,
          minimumStockThreshold: minimumStockThreshold ? Number(minimumStockThreshold) : null,
          openingStock: openingStock ? Number(openingStock) : null,
          openingUnitCost: openingUnitCost ? Number(openingUnitCost) : null,
          supplierName: supplierName.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrorMessage(json.error || "We couldn't add this product. Please try again.");
      } else {
        setSuccessMessage(`Added "${name}" to your shop stock!`);
        await refreshData();
        setTimeout(() => {
          closeModal();
        }, 1100);
      }
    } catch {
      setErrorMessage("We couldn't add this product. Check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories = [
    "Cement & Aggregates",
    "Steel & Iron Rods",
    "Plumbing",
    "Roofing & Timber",
    "Finishing & Tiles",
    "Paints & Chemicals",
    "Electricals",
    "General Hardware",
  ];

  const commonUnits = ["bags", "lengths", "pipes", "sheets", "drums", "trips", "pieces", "cartons", "kg"];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <PackagePlus className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Add Product</h3>
              <p className="text-xs text-slate-500">New building material item in your shop</p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Success Banner */}
        {successMessage ? (
          <div className="my-6 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white mb-2">
              <Check className="h-6 w-6 stroke-[3]" />
            </div>
            <p className="font-bold text-emerald-900">{successMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-800 border border-red-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Product Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                What is the product called? *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Dangote 3X Cement 50kg"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[48px] rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-bold text-slate-900 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
              />
            </div>

            {/* Category & Unit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Unit of Measure</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                >
                  {commonUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selling Price */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-emerald-600" />
                <span>Default Selling Price for one (₦)</span>
              </label>
              <input
                type="number"
                placeholder="e.g. 9200"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
              />
              <span className="text-[10px] text-slate-500">
                Auto-fills when recording sales in shop and on WhatsApp.
              </span>
            </div>

            {/* Replenishment Settings */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Replenishment Settings
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Days of stock to keep
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="7"
                    value={desiredCoverageDays}
                    onChange={(e) => setDesiredCoverageDays(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-900"
                  />
                  <span className="text-[10px] text-slate-500">Default: 7 days</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Minimum stock level (optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 20"
                    value={minimumStockThreshold}
                    onChange={(e) => setMinimumStockThreshold(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-900"
                  />
                  <span className="text-[10px] text-slate-500">Alert if stock hits this</span>
                </div>
              </div>
            </div>

            {/* Initial Opening Stock Section */}
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-3.5 space-y-3">
              <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                Physical Stock in Shop Today
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Quantity you have now ({unit})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 100"
                    value={openingStock}
                    onChange={(e) => setOpeningStock(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Price paid for one (₦)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 8500"
                    value={openingUnitCost}
                    onChange={(e) => setOpeningUnitCost(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Supplier / Vendor name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dangote Depot Lagos"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                />
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 text-base font-bold text-white shadow-md shadow-amber-600/30 hover:bg-amber-700 active:scale-98 transition-all disabled:opacity-50"
              >
                <PackagePlus className="h-5 w-5" />
                <span>{isSubmitting ? "Adding product..." : "Save Product"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
