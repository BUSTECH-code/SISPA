"use client";

import React, { useState, useEffect } from "react";
import { useStock } from "@/context/StockContext";
import { Truck, X, Check, AlertCircle, Lock } from "lucide-react";

export function RecordDeliveryModal() {
  const { activeModal, selectedProduct, products, isOwner, closeModal, refreshData } = useStock();

  const [productId, setProductId] = useState<number | string>("");
  const [quantityReceived, setQuantityReceived] = useState<string>("");
  const [unitCost, setUnitCost] = useState<string>("");
  const [supplierName, setSupplierName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Confirmation State
  const [confirmedDelivery, setConfirmedDelivery] = useState<{
    productName: string;
    unit: string;
    quantity: number;
    supplierName: string;
    unitCost: number | null;
    newTotalStock: number;
  } | null>(null);

  useEffect(() => {
    if (activeModal === "DELIVERY") {
      if (selectedProduct) {
        setProductId(selectedProduct.id);
        if (selectedProduct.lastSupplierInfo?.supplierName) {
          setSupplierName(selectedProduct.lastSupplierInfo.supplierName);
        }
        if (isOwner && selectedProduct.lastSupplierInfo?.unitCost) {
          setUnitCost(String(selectedProduct.lastSupplierInfo.unitCost));
        }
      } else if (products.length > 0) {
        setProductId(products[0].id);
        if (products[0].lastSupplierInfo?.supplierName) {
          setSupplierName(products[0].lastSupplierInfo.supplierName);
        }
        if (isOwner && products[0].lastSupplierInfo?.unitCost) {
          setUnitCost(String(products[0].lastSupplierInfo.unitCost));
        }
      }
      setQuantityReceived("");
      setNotes("");
      setErrorMessage(null);
      setConfirmedDelivery(null);
    }
  }, [activeModal, selectedProduct, products, isOwner]);

  if (activeModal !== "DELIVERY") return null;

  const currentProduct = products.find((p) => p.id === Number(productId));

  const handleProductChange = (newId: string) => {
    setProductId(newId);
    const prod = products.find((p) => p.id === Number(newId));
    if (prod?.lastSupplierInfo) {
      if (prod.lastSupplierInfo.supplierName) setSupplierName(prod.lastSupplierInfo.supplierName);
      if (isOwner && prod.lastSupplierInfo.unitCost) setUnitCost(String(prod.lastSupplierInfo.unitCost));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const qty = Number(quantityReceived);
    if (!qty || qty <= 0) {
      setErrorMessage("This delivery could not be recorded. Nothing was changed. Please enter a received quantity greater than 0.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: Number(productId),
          quantityReceived: qty,
          unitCost: isOwner && unitCost ? Number(unitCost) : null,
          supplierName: supplierName.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrorMessage(json.error || "This delivery could not be recorded. Nothing was changed. Please check your network connection and try again.");
      } else {
        const updatedTotal = (currentProduct ? currentProduct.currentStock : 0) + qty;
        setConfirmedDelivery({
          productName: currentProduct?.name || "Product",
          unit: currentProduct?.unit || "units",
          quantity: qty,
          supplierName: supplierName.trim() || "Supplier",
          unitCost: isOwner && unitCost ? Number(unitCost) : null,
          newTotalStock: updatedTotal,
        });

        await refreshData();
      }
    } catch {
      setErrorMessage("This delivery could not be recorded. Nothing was changed. Please check your network connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Truck className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Receive Goods (Delivery)</h3>
              <p className="text-xs text-slate-500">Physical stock arrived at the shop</p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Success Confirmation Card */}
        {confirmedDelivery ? (
          <div className="my-5 rounded-3xl bg-linear-to-b from-emerald-50 to-white border border-emerald-200 p-5 space-y-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
                <Check className="h-6 w-6 stroke-[3]" />
              </div>
              <div>
                <h4 className="text-base font-black text-emerald-950">Delivery Recorded!</h4>
                <p className="text-xs text-emerald-700">Physical stock added to yard inventory.</p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-3.5 border border-emerald-100 divide-y divide-slate-100 text-xs space-y-1.5">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Product Received:</span>
                <span className="font-bold text-slate-900">{confirmedDelivery.productName}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Quantity Added:</span>
                <span className="font-black text-emerald-700">+{confirmedDelivery.quantity} {confirmedDelivery.unit}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Supplier:</span>
                <span className="font-semibold text-slate-800">{confirmedDelivery.supplierName}</span>
              </div>
              {isOwner && confirmedDelivery.unitCost && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Purchase Price Logged:</span>
                  <span className="font-bold text-slate-900">₦{confirmedDelivery.unitCost.toLocaleString()} each</span>
                </div>
              )}
              <div className="flex justify-between py-1 pt-1.5 font-bold">
                <span className="text-slate-800">New Shop Stock Total:</span>
                <span className="text-slate-900 text-sm font-black">{confirmedDelivery.newTotalStock} {confirmedDelivery.unit}</span>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={closeModal}
                className="flex-1 min-h-[46px] rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 active:scale-98 transition-all"
              >
                Done
              </button>
              <button
                onClick={() => {
                  setConfirmedDelivery(null);
                  setQuantityReceived("");
                }}
                className="flex-1 min-h-[46px] rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 active:scale-98 transition-all"
              >
                Receive Another
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-800 border border-red-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Product Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Which product arrived?
              </label>
              <select
                value={productId}
                onChange={(e) => handleProductChange(e.target.value)}
                required
                className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Current: {p.currentStock} {p.unit})
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity Received */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  How many arrived physically? *
                </label>
                {currentProduct && (
                  <span className="text-xs text-slate-500">
                    Current shop stock: {currentProduct.currentStock} {currentProduct.unit}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0.1"
                  required
                  placeholder="e.g. 100"
                  value={quantityReceived}
                  onChange={(e) => setQuantityReceived(e.target.value)}
                  className="w-full min-h-[52px] rounded-xl border border-slate-300 px-4 py-2 text-xl font-black text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  {currentProduct?.unit || "units"}
                </span>
              </div>
            </div>

            {/* Price paid for one & Supplier Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {isOwner ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Price paid for one (₦) (Owner)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g. 8500"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    className="w-full min-h-[46px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 focus:border-emerald-600"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">Used for COGS & profit calculation</p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-500 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-slate-400" />
                  <span>Purchase cost is restricted to shop owner</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Supplier / Vendor name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dangote Depot Lagos"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full min-h-[46px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Optional Note */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Optional note (e.g. Delivery truck number or driver)
              </label>
              <input
                type="text"
                placeholder="e.g. Waybill #4092, driver Ahmed"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-slate-400"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-base font-bold text-white shadow-md shadow-emerald-600/30 hover:bg-emerald-700 active:scale-98 transition-all disabled:opacity-50"
              >
                <Truck className="h-5 w-5" />
                <span>{isSubmitting ? "Saving delivery..." : "Confirm Delivery Received"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
