"use client";

import React, { useState, useEffect } from "react";
import { useStock } from "@/context/StockContext";
import { TrendingDown, X, Check, AlertCircle, User, CreditCard } from "lucide-react";

export function RecordSaleModal() {
  const { activeModal, selectedProduct, products, customers, closeModal, refreshData } = useStock();

  const [productId, setProductId] = useState<number | string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [customerMode, setCustomerMode] = useState<"EXISTING" | "NEW" | "WALK_IN">("WALK_IN");
  const [customerId, setCustomerId] = useState<string>("");
  const [newCustomerName, setNewCustomerName] = useState<string>("");
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Comprehensive Sale Confirmation State (Section 9)
  const [confirmedSaleInfo, setConfirmedSaleInfo] = useState<{
    productName: string;
    unit: string;
    quantity: number;
    totalAmount: number;
    amountPaid: number;
    outstanding: number;
    customerName: string;
    stockRemaining: number;
  } | null>(null);

  useEffect(() => {
    if (activeModal === "SALE") {
      const prod = selectedProduct || (products.length > 0 ? products[0] : null);
      if (prod) {
        setProductId(prod.id);
        if (prod.sellingPrice) {
          setUnitPrice(String(prod.sellingPrice));
        } else {
          setUnitPrice("");
        }
      }
      setQuantity("");
      setAmountPaid("");
      setCustomerId("");
      setNewCustomerName("");
      setCustomerMode("WALK_IN");
      setNotes("");
      setErrorMessage(null);
      setConfirmedSaleInfo(null);
    }
  }, [activeModal, selectedProduct, products]);

  if (activeModal !== "SALE") return null;

  const currentProduct = products.find((p) => p.id === Number(productId));

  const handleProductChange = (newId: string) => {
    setProductId(newId);
    const prod = products.find((p) => p.id === Number(newId));
    if (prod?.sellingPrice) {
      setUnitPrice(String(prod.sellingPrice));
    }
  };

  const qtyNum = Number(quantity) || 0;
  const priceNum = Number(unitPrice) || 0;
  const totalCalculated = qtyNum * priceNum;
  const paidNum = amountPaid === "" ? totalCalculated : Number(amountPaid);
  const creditOutstanding = Math.max(0, totalCalculated - paidNum);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!qtyNum || qtyNum <= 0) {
      setErrorMessage("This sale could not be recorded. Nothing was changed. Please enter a quantity greater than 0.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: Number(productId),
          quantity: qtyNum,
          unitPrice: priceNum > 0 ? priceNum : undefined,
          customerId: customerMode === "EXISTING" && customerId ? Number(customerId) : undefined,
          customerName: customerMode === "NEW" ? newCustomerName.trim() : undefined,
          amountPaid: paidNum,
          notes: notes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrorMessage(json.error || "This sale could not be recorded. Nothing was changed. Please check your network connection and try again.");
      } else {
        const remainingStock = (currentProduct ? currentProduct.currentStock : 0) - qtyNum;
        let custDisplayName = "Walk-in Customer";
        if (customerMode === "EXISTING" && customerId) {
          const c = customers.find((x) => x.id === Number(customerId));
          if (c) custDisplayName = c.name;
        } else if (customerMode === "NEW" && newCustomerName.trim()) {
          custDisplayName = newCustomerName.trim();
        }

        setConfirmedSaleInfo({
          productName: currentProduct?.name || "Product",
          unit: currentProduct?.unit || "units",
          quantity: qtyNum,
          totalAmount: totalCalculated,
          amountPaid: paidNum,
          outstanding: creditOutstanding,
          customerName: custDisplayName,
          stockRemaining: remainingStock,
        });

        await refreshData();
      }
    } catch {
      setErrorMessage("This sale could not be recorded. Nothing was changed. Please check your network connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const addQuickQty = (amount: number) => {
    const cur = Number(quantity) || 0;
    setQuantity(String(cur + amount));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-700">
              <TrendingDown className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Record Sale</h3>
              <p className="text-xs text-slate-500">I sold goods in the shop</p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* COMPREHENSIVE SALE CONFIRMATION CARD (Section 9) */}
        {confirmedSaleInfo ? (
          <div className="my-5 rounded-3xl bg-linear-to-b from-emerald-50 to-white border border-emerald-200 p-5 space-y-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
                <Check className="h-6 w-6 stroke-[3]" />
              </div>
              <div>
                <h4 className="text-base font-black text-emerald-950">Sale Recorded Successfully!</h4>
                <p className="text-xs text-emerald-700">Stock and financial records have been updated.</p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-3.5 border border-emerald-100 divide-y divide-slate-100 text-xs space-y-1.5">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Product Sold:</span>
                <span className="font-bold text-slate-900">{confirmedSaleInfo.productName}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Quantity Sold:</span>
                <span className="font-bold text-slate-900">{confirmedSaleInfo.quantity} {confirmedSaleInfo.unit}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Total Sale Value:</span>
                <span className="font-black text-slate-900">₦{confirmedSaleInfo.totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-slate-800">{confirmedSaleInfo.customerName}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Payment:</span>
                <span className="font-bold text-slate-900">
                  {confirmedSaleInfo.outstanding === 0
                    ? "Paid in full (Cash/Transfer)"
                    : `₦${confirmedSaleInfo.amountPaid.toLocaleString()} paid, ₦${confirmedSaleInfo.outstanding.toLocaleString()} credit`}
                </span>
              </div>
              <div className="flex justify-between py-1 pt-1.5 font-bold">
                <span className="text-emerald-900">Stock Remaining in Shop:</span>
                <span className="text-emerald-800 text-sm">{confirmedSaleInfo.stockRemaining} {confirmedSaleInfo.unit}</span>
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
                  setConfirmedSaleInfo(null);
                  setQuantity("");
                  setAmountPaid("");
                }}
                className="flex-1 min-h-[46px] rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 active:scale-98 transition-all"
              >
                Record Another Sale
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
                Which product did you sell?
              </label>
              <select
                value={productId}
                onChange={(e) => handleProductChange(e.target.value)}
                required
                className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.currentStock} {p.unit} in shop)
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  How many did you sell?
                </label>
                {currentProduct && (
                  <span className="text-xs text-slate-500">
                    In shop: <strong className="text-slate-800">{currentProduct.currentStock} {currentProduct.unit}</strong>
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
                  placeholder="e.g. 10"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full min-h-[52px] rounded-xl border border-slate-300 px-4 py-2 text-xl font-black text-slate-900 focus:border-red-600 focus:ring-2 focus:ring-red-600/20"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  {currentProduct?.unit || "units"}
                </span>
              </div>

              {/* Fast number chips */}
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-medium text-slate-400 mr-1">Quick:</span>
                {[1, 5, 10, 20, 50].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => addQuickQty(val)}
                    className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 active:scale-95 transition-all"
                  >
                    +{val}
                  </button>
                ))}
              </div>
            </div>

            {/* Selling Price & Total */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Selling Price for one (₦)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 9000"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Total Sale Value
                </label>
                <div className="flex min-h-[44px] items-center rounded-xl bg-slate-100 px-3 text-sm font-black text-slate-900">
                  ₦{totalCalculated.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Customer & Debt (Collect Job) */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Customer & Payment
                </label>
                <div className="flex rounded-lg bg-slate-200/80 p-0.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setCustomerMode("WALK_IN")}
                    className={`rounded-md px-2 py-0.5 transition-colors ${
                      customerMode === "WALK_IN" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
                    }`}
                  >
                    Walk-in
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMode("EXISTING")}
                    className={`rounded-md px-2 py-0.5 transition-colors ${
                      customerMode === "EXISTING" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
                    }`}
                  >
                    Known
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMode("NEW")}
                    className={`rounded-md px-2 py-0.5 transition-colors ${
                      customerMode === "NEW" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
                    }`}
                  >
                    New
                  </button>
                </div>
              </div>

              {customerMode === "EXISTING" && (
                <div>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900"
                  >
                    <option value="">Choose known customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.outstandingBalance > 0 ? `(Owes ₦${c.outstandingBalance.toLocaleString()})` : "(Clear)"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {customerMode === "NEW" && (
                <div>
                  <input
                    type="text"
                    required
                    placeholder="Enter customer or contractor name..."
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-900"
                  />
                </div>
              )}

              {/* Amount Paid vs Credit */}
              {(customerMode === "EXISTING" || customerMode === "NEW") && totalCalculated > 0 && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Cash/Transfer Paid Today (₦)
                    </label>
                    <input
                      type="number"
                      placeholder={String(totalCalculated)}
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Customer Debt Created
                    </label>
                    <div className={`flex min-h-[42px] items-center rounded-xl px-3 text-xs font-black ${
                      creditOutstanding > 0 ? "bg-amber-100 text-amber-950" : "bg-emerald-100 text-emerald-950"
                    }`}>
                      {creditOutstanding > 0 ? `₦${creditOutstanding.toLocaleString()} Credit` : "Fully Paid"}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Optional Note */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Optional note (site location or delivery contact)
              </label>
              <input
                type="text"
                placeholder="e.g. Lekki Phase 1 project site"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-slate-400"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 text-base font-bold text-white shadow-md shadow-red-600/30 hover:bg-red-700 active:scale-98 transition-all disabled:opacity-50"
              >
                <TrendingDown className="h-5 w-5" />
                <span>{isSubmitting ? "Saving sale..." : "Save Sale"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
