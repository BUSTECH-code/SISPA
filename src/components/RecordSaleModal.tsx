"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useStock } from "@/context/StockContext";
import {
  TrendingDown,
  X,
  Check,
  AlertCircle,
  CreditCard,
  Plus,
  Trash2,
  Share2,
  Copy,
  WifiOff,
  Search,
  Receipt,
  RotateCcw,
} from "lucide-react";

interface SaleLineItem {
  id: string; // local key
  productId: number;
  quantity: string;
  unitPrice: string;
}

export function RecordSaleModal() {
  const {
    activeModal,
    selectedProduct,
    products,
    customers,
    closeModal,
    refreshData,
    enqueueLocalMutation,
    user,
  } = useStock();

  // Multi-line items
  const [items, setItems] = useState<SaleLineItem[]>([
    { id: "item-1", productId: 0, quantity: "", unitPrice: "" },
  ]);

  // Customer & Payment
  const [customerMode, setCustomerMode] = useState<"WALK_IN" | "EXISTING" | "NEW">("WALK_IN");
  const [customerId, setCustomerId] = useState<string>("");
  const [newCustomerName, setNewCustomerName] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER" | "POS" | "CREDIT" | "PARTIAL">("CASH");
  const [amountPaidCustom, setAmountPaidCustom] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  // Confirmed sale result for receipt view
  const [confirmedSale, setConfirmedSale] = useState<{
    items: Array<{
      productName: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>;
    totalAmount: number;
    amountPaid: number;
    debtCreated: number;
    customerName: string;
    paymentMethod: string;
    timestamp: string;
    isOffline: boolean;
  } | null>(null);

  // Search filter for products
  const [productSearch, setProductSearch] = useState("");

  useEffect(() => {
    if (activeModal === "SALE") {
      const initialProd = selectedProduct || (products.length > 0 ? products[0] : null);
      if (initialProd) {
        setItems([
          {
            id: "item-1",
            productId: initialProd.id,
            quantity: "",
            unitPrice: initialProd.sellingPrice ? String(initialProd.sellingPrice) : "",
          },
        ]);
      } else {
        setItems([{ id: "item-1", productId: 0, quantity: "", unitPrice: "" }]);
      }
      setCustomerMode("WALK_IN");
      setCustomerId("");
      setNewCustomerName("");
      setPaymentMethod("CASH");
      setAmountPaidCustom("");
      setNotes("");
      setErrorMessage(null);
      setConfirmedSale(null);
      setCopiedReceipt(false);
      setProductSearch("");
    }
  }, [activeModal, selectedProduct, products]);

  if (activeModal !== "SALE") return null;

  // Calculate totals
  const totalSaleAmount = items.reduce((acc, it) => {
    const q = Number(it.quantity) || 0;
    const p = Number(it.unitPrice) || 0;
    return acc + q * p;
  }, 0);

  const calculatedAmountPaid = useMemo(() => {
    if (paymentMethod === "CREDIT") return 0;
    if (paymentMethod === "PARTIAL") {
      return amountPaidCustom === "" ? 0 : Number(amountPaidCustom);
    }
    // CASH, TRANSFER, POS -> Paid in full
    return totalSaleAmount;
  }, [paymentMethod, amountPaidCustom, totalSaleAmount]);

  const debtCreated = Math.max(0, totalSaleAmount - calculatedAmountPaid);

  // Helpers for line items
  const handleItemChange = (index: number, field: "productId" | "quantity" | "unitPrice", value: any) => {
    setItems((prev) => {
      const next = [...prev];
      if (field === "productId") {
        const prodId = Number(value);
        const prod = products.find((p) => p.id === prodId);
        next[index] = {
          ...next[index],
          productId: prodId,
          unitPrice: prod?.sellingPrice ? String(prod.sellingPrice) : next[index].unitPrice,
        };
      } else {
        next[index] = { ...next[index], [field]: value };
      }
      return next;
    });
  };

  const addLineItem = () => {
    const nextProd = products.find((p) => !items.some((it) => it.productId === p.id)) || products[0];
    setItems((prev) => [
      ...prev,
      {
        id: "item-" + (prev.length + 1) + "-" + Date.now(),
        productId: nextProd ? nextProd.id : 0,
        quantity: "",
        unitPrice: nextProd?.sellingPrice ? String(nextProd.sellingPrice) : "",
      },
    ]);
  };

  const removeLineItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addQuickQty = (index: number, delta: number) => {
    const cur = Number(items[index].quantity) || 0;
    handleItemChange(index, "quantity", String(cur + delta));
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate quantities
    for (let i = 0; i < items.length; i++) {
      const q = Number(items[i].quantity);
      if (!q || q <= 0) {
        setErrorMessage(`Please enter a valid quantity for item #${i + 1}.`);
        return;
      }
      if (!items[i].productId) {
        setErrorMessage(`Please select a product for item #${i + 1}.`);
        return;
      }
    }

    if (totalSaleAmount <= 0) {
      setErrorMessage("Total sale amount must be greater than 0.");
      return;
    }

    if (customerMode === "NEW" && !newCustomerName.trim()) {
      setErrorMessage("Please enter the name of the new customer.");
      return;
    }

    if (customerMode === "EXISTING" && !customerId) {
      setErrorMessage("Please select a registered customer.");
      return;
    }

    setIsSubmitting(true);

    const clientTxId = "sale_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
    const salePayload = {
      items: items.map((it) => ({
        productId: it.productId,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice) || undefined,
      })),
      // Single product compatibility for legacy endpoints
      productId: items[0].productId,
      quantity: Number(items[0].quantity),
      unitPrice: Number(items[0].unitPrice) || undefined,
      customerId: customerMode === "EXISTING" && customerId ? Number(customerId) : undefined,
      customerName: customerMode === "NEW" ? newCustomerName.trim() : undefined,
      amountPaid: calculatedAmountPaid,
      paymentMethod,
      notes: notes.trim() || undefined,
      idempotencyKey: clientTxId,
    };

    let custDisplayName = "Walk-in Customer";
    if (customerMode === "EXISTING" && customerId) {
      const c = customers.find((x) => x.id === Number(customerId));
      if (c) custDisplayName = c.name;
    } else if (customerMode === "NEW" && newCustomerName.trim()) {
      custDisplayName = newCustomerName.trim();
    }

    const receiptItems = items.map((it) => {
      const p = products.find((prod) => prod.id === it.productId);
      const q = Number(it.quantity);
      const rate = Number(it.unitPrice) || 0;
      return {
        productName: p?.name || "Material Item",
        unit: p?.unit || "units",
        quantity: q,
        unitPrice: rate,
        subtotal: q * rate,
      };
    });

    const isOfflineMode = typeof navigator !== "undefined" && !navigator.onLine;

    // Direct Offline Queue Path
    if (isOfflineMode) {
      const summary = `Sold ${items.length} item(s) (Total ₦${totalSaleAmount.toLocaleString()}) to ${custDisplayName}`;
      await enqueueLocalMutation({
        type: "SALE",
        endpoint: "/api/sales",
        payload: salePayload,
        summary,
      });

      setConfirmedSale({
        items: receiptItems,
        totalAmount: totalSaleAmount,
        amountPaid: calculatedAmountPaid,
        debtCreated,
        customerName: custDisplayName,
        paymentMethod,
        timestamp: new Date().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }),
        isOffline: true,
      });
      setIsSubmitting(false);
      return;
    }

    // Online Fetch Path
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": clientTxId,
        },
        body: JSON.stringify(salePayload),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setErrorMessage(json?.error || "This sale could not be recorded. Please check connection and try again.");
      } else {
        setConfirmedSale({
          items: receiptItems,
          totalAmount: totalSaleAmount,
          amountPaid: calculatedAmountPaid,
          debtCreated,
          customerName: custDisplayName,
          paymentMethod,
          timestamp: new Date().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }),
          isOffline: false,
        });

        await refreshData();
      }
    } catch {
      // Network drop during call -> fallback to offline queue
      const summary = `Sold ${items.length} item(s) (Total ₦${totalSaleAmount.toLocaleString()}) to ${custDisplayName}`;
      await enqueueLocalMutation({
        type: "SALE",
        endpoint: "/api/sales",
        payload: salePayload,
        summary,
      });

      setConfirmedSale({
        items: receiptItems,
        totalAmount: totalSaleAmount,
        amountPaid: calculatedAmountPaid,
        debtCreated,
        customerName: custDisplayName,
        paymentMethod,
        timestamp: new Date().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }),
        isOffline: true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Receipt format generator
  const getReceiptText = () => {
    if (!confirmedSale) return "";
    const store = user?.businessName || "SISPA Building Materials Depot";
    const lines = [
      `🧾 *${store.toUpperCase()}*`,
      `Date: ${confirmedSale.timestamp}`,
      `Customer: ${confirmedSale.customerName}`,
      `---------------------------------`,
      ...confirmedSale.items.map(
        (it) => `• ${it.productName}: ${it.quantity} ${it.unit} @ ₦${it.unitPrice.toLocaleString()} = ₦${it.subtotal.toLocaleString()}`
      ),
      `---------------------------------`,
      `*Total: ₦${confirmedSale.totalAmount.toLocaleString()}*`,
      `Paid: ₦${confirmedSale.amountPaid.toLocaleString()} (${confirmedSale.paymentMethod})`,
      confirmedSale.debtCreated > 0
        ? `*Balance Due: ₦${confirmedSale.debtCreated.toLocaleString()}*`
        : `*Status: Fully Settled*`,
      `---------------------------------`,
      `Thank you for your patronage!`,
    ];
    return lines.join("\n");
  };

  const handleShareWhatsApp = () => {
    const text = getReceiptText();
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  const handleCopyReceipt = () => {
    const text = getReceiptText();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedReceipt(true);
      setTimeout(() => setCopiedReceipt(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <TrendingDown className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">Record Sale</h3>
                {items.length > 1 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                    {items.length} items
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">Fast counter sale &amp; multi-item billing</p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* COMPREHENSIVE SHAREABLE RECEIPT VIEW */}
        {confirmedSale ? (
          <div className="my-5 rounded-3xl bg-linear-to-b from-slate-50 to-white border border-slate-200 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
                  <Check className="h-6 w-6 stroke-[3]" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">Sale Confirmed!</h4>
                  <p className="text-xs text-slate-500">{confirmedSale.timestamp}</p>
                </div>
              </div>
              {confirmedSale.isOffline && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900">
                  <WifiOff className="h-3 w-3" /> Saved Offline
                </span>
              )}
            </div>

            {/* Receipt Card */}
            <div className="rounded-2xl bg-white p-4 border border-slate-200 divide-y divide-slate-100 text-xs font-sans space-y-2">
              <div className="pb-2 text-center border-b border-slate-100">
                <p className="font-black text-sm text-slate-900 tracking-tight">
                  {user?.businessName || "SISPA Building Materials"}
                </p>
                <p className="text-[11px] text-slate-500">Customer: <strong className="text-slate-800">{confirmedSale.customerName}</strong></p>
              </div>

              {/* Line items table */}
              <div className="py-2 space-y-1.5">
                {confirmedSale.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-slate-900">{it.productName}</p>
                      <p className="text-[11px] text-slate-500">
                        {it.quantity} {it.unit} × ₦{it.unitPrice.toLocaleString()}
                      </p>
                    </div>
                    <span className="font-bold text-slate-900">
                      ₦{it.subtotal.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              {/* Financial summary */}
              <div className="pt-2 space-y-1 text-xs">
                <div className="flex justify-between font-bold text-slate-700">
                  <span>Grand Total:</span>
                  <span className="text-base font-black text-slate-900">
                    ₦{confirmedSale.totalAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Amount Paid ({confirmedSale.paymentMethod}):</span>
                  <span className="font-bold text-emerald-800">
                    ₦{confirmedSale.amountPaid.toLocaleString()}
                  </span>
                </div>
                {confirmedSale.debtCreated > 0 ? (
                  <div className="flex justify-between font-black text-red-700 pt-1 border-t border-slate-100">
                    <span>Credit / Balance Due:</span>
                    <span>₦{confirmedSale.debtCreated.toLocaleString()}</span>
                  </div>
                ) : (
                  <div className="flex justify-between font-bold text-emerald-700 pt-1 border-t border-slate-100">
                    <span>Payment Status:</span>
                    <span>Fully Paid</span>
                  </div>
                )}
              </div>
            </div>

            {/* Sharing buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleShareWhatsApp}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 active:scale-98 transition-all"
              >
                <Share2 className="h-4 w-4" />
                <span>Share WhatsApp</span>
              </button>

              <button
                onClick={handleCopyReceipt}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-98 transition-all"
              >
                {copiedReceipt ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-slate-500" />}
                <span>{copiedReceipt ? "Copied!" : "Copy Receipt"}</span>
              </button>
            </div>

            {/* Done & Another Sale */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={closeModal}
                className="flex-1 min-h-[46px] rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 active:scale-98 transition-all"
              >
                Done
              </button>
              <button
                onClick={() => {
                  setConfirmedSale(null);
                  setItems([
                    {
                      id: "item-1",
                      productId: products[0]?.id || 0,
                      quantity: "",
                      unitPrice: products[0]?.sellingPrice ? String(products[0].sellingPrice) : "",
                    },
                  ]);
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

            {/* Line items section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Items to Sell ({items.length})
                </label>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Another Item</span>
                </button>
              </div>

              {items.map((item, idx) => {
                const prod = products.find((p) => p.id === item.productId);
                const subtotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2.5 relative"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                        Item #{idx + 1}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="text-slate-400 hover:text-red-600 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Product Selector */}
                    <div>
                      <select
                        value={item.productId}
                        onChange={(e) => handleItemChange(idx, "productId", e.target.value)}
                        required
                        className="w-full min-h-[46px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-amber-600"
                      >
                        <option value="">Select building material...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.currentStock} {p.unit} in shop)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quantity & Quick Chips */}
                    <div>
                      <div className="flex items-center justify-between mb-1 text-[11px]">
                        <span className="font-bold text-slate-700">Quantity</span>
                        {prod && (
                          <span className="text-slate-500">
                            Available: <strong>{prod.currentStock} {prod.unit}</strong>
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
                          placeholder="e.g. 20"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                          className="w-full min-h-[48px] rounded-xl border border-slate-300 px-3 py-1.5 text-lg font-black text-slate-900"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          {prod?.unit || "units"}
                        </span>
                      </div>

                      {/* Quick Chips */}
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-slate-400">Add:</span>
                        {[5, 10, 20, 50, 100].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => addQuickQty(idx, v)}
                            className="min-h-[28px] rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-100 active:scale-95 transition-all"
                          >
                            +{v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Unit Price & Subtotal */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                          Unit Price (₦)
                        </label>
                        <input
                          type="number"
                          placeholder="Rate"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(idx, "unitPrice", e.target.value)}
                          className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                          Line Subtotal
                        </label>
                        <div className="flex min-h-[40px] items-center rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-900">
                          ₦{subtotal.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Customer Selection */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Customer
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
                    <option value="">Choose known customer / contractor...</option>
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
                    placeholder="Enter customer or site engineer name..."
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-900"
                  />
                </div>
              )}
            </div>

            {/* Payment Method & Settlement */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-800 block">
                Payment Method &amp; Settlement
              </label>

              {/* Quick settlement pills */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("CASH")}
                  className={`min-h-[38px] rounded-xl border transition-all ${
                    paymentMethod === "CASH"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Cash Full
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("TRANSFER")}
                  className={`min-h-[38px] rounded-xl border transition-all ${
                    paymentMethod === "TRANSFER"
                      ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Transfer Full
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("POS")}
                  className={`min-h-[38px] rounded-xl border transition-all ${
                    paymentMethod === "POS"
                      ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  POS Full
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("CREDIT")}
                  className={`min-h-[38px] rounded-xl border transition-all ${
                    paymentMethod === "CREDIT"
                      ? "bg-red-600 text-white border-red-600 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  100% Credit
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("PARTIAL")}
                  className={`col-span-2 sm:col-span-1 min-h-[38px] rounded-xl border transition-all ${
                    paymentMethod === "PARTIAL"
                      ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Split / Part
                </button>
              </div>

              {/* Partial amount input */}
              {paymentMethod === "PARTIAL" && (
                <div className="pt-1">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Amount Paid Today (₦)
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 50000"
                    value={amountPaidCustom}
                    onChange={(e) => setAmountPaidCustom(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-amber-300 px-3 text-sm font-bold text-slate-900 focus:border-amber-600"
                  />
                </div>
              )}

              {/* Bill Totals Summary */}
              <div className="rounded-xl bg-slate-50 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between font-bold text-slate-700">
                  <span>Grand Total Sale Value:</span>
                  <span className="text-base font-black text-slate-900">
                    ₦{totalSaleAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Payment to Collect:</span>
                  <span className="font-bold text-emerald-800">
                    ₦{calculatedAmountPaid.toLocaleString()}
                  </span>
                </div>
                {debtCreated > 0 && (
                  <div className="flex justify-between font-black text-red-700 pt-1 border-t border-slate-200">
                    <span>Customer Debt Balance Created:</span>
                    <span>₦{debtCreated.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Optional Note */}
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Optional note (site address or delivery driver)
              </label>
              <input
                type="text"
                placeholder="e.g. For Banana Island site project"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 text-xs text-slate-800"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || totalSaleAmount <= 0}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 text-base font-bold text-white shadow-md shadow-amber-600/30 hover:bg-amber-700 active:scale-98 transition-all disabled:opacity-50"
              >
                <TrendingDown className="h-5 w-5" />
                <span>
                  {isSubmitting
                    ? "Saving sale..."
                    : `Save Sale (₦${totalSaleAmount.toLocaleString()})`}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
