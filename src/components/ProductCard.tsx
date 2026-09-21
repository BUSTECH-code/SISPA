"use client";

import React, { useState } from "react";
import type { EnrichedProduct } from "@/server/stockService";
import { useStock } from "@/context/StockContext";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ShoppingCart,
  TrendingDown,
  Truck,
  Scale,
  Check,
  ChevronRight,
  Sparkles,
  Info,
} from "lucide-react";

export function ProductCard({
  product,
  compact = false,
}: {
  product: EnrichedProduct;
  compact?: boolean;
}) {
  const {
    openRecordSale,
    openRecordDelivery,
    openCountStock,
    openProductDetails,
    addToBuyingList,
    buyingList,
    isOwner,
  } = useStock();

  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [showWhyBuy, setShowWhyBuy] = useState(false);

  const isAlreadyInBuyingList = buyingList.some(
    (item) => item.productId === product.id && !item.isCompleted
  );

  const handleAddToList = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAdding(true);
    const success = await addToBuyingList(product);
    setIsAdding(false);
    if (success) {
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 2000);
    }
  };

  const { status, suggestedPurchaseQuantity, daysRemaining, velocity, explanation } = product.intelligence;
  const isNegative = product.currentStock < 0;

  // Status visual themes
  const statusConfig = {
    RUNNING_LOW: {
      badgeBg: "bg-red-50 border-red-200 text-red-700",
      dotBg: "bg-red-600",
      cardBorder: isNegative ? "border-red-400 bg-red-50/20" : "border-red-200/80 bg-white",
      icon: AlertCircle,
      label: "BUY NOW",
      accent: "text-red-700",
    },
    CHECK_SOON: {
      badgeBg: "bg-amber-50 border-amber-200 text-amber-800",
      dotBg: "bg-amber-500",
      cardBorder: "border-amber-200/80 bg-white",
      icon: AlertTriangle,
      label: "BUY SOON",
      accent: "text-amber-700",
    },
    OK: {
      badgeBg: "bg-emerald-50 border-emerald-200 text-emerald-800",
      dotBg: "bg-emerald-500",
      cardBorder: "border-slate-200/80 bg-white",
      icon: CheckCircle2,
      label: "OK",
      accent: "text-emerald-700",
    },
    NO_DATA: {
      badgeBg: "bg-slate-100 border-slate-200 text-slate-700",
      dotBg: "bg-slate-400",
      cardBorder: "border-slate-200/80 bg-white",
      icon: HelpCircle,
      label: "NO DATA",
      accent: "text-slate-600",
    },
  }[status];

  const StatusIcon = statusConfig.icon;

  return (
    <div
      onClick={() => openProductDetails(product)}
      className={`group relative rounded-2xl border p-4 sm:p-5 shadow-xs transition-all hover:shadow-md cursor-pointer ${statusConfig.cardBorder}`}
    >
      {/* Top row: Status Badge & Category */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusConfig.badgeBg}`}
          >
            <span className={`h-2 w-2 rounded-full ${statusConfig.dotBg} ${status === "RUNNING_LOW" ? "animate-pulse" : ""}`} />
            <StatusIcon className="h-3.5 w-3.5" />
            {statusConfig.label}
          </span>
          <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
            {product.category}
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            openProductDetails(product);
          }}
          className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-0.5 p-1"
        >
          <span>Details</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Product Name */}
      <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-amber-800 transition-colors">
        {product.name}
      </h3>

      {/* Main Numbers: Current Stock & Time Left */}
      <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50/80 p-3 border border-slate-100">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Current Stock
          </span>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span
              className={`text-xl sm:text-2xl font-black ${
                isNegative ? "text-red-700" : product.currentStock === 0 ? "text-red-600" : "text-slate-900"
              }`}
            >
              {product.currentStock}
            </span>
            <span className="text-xs font-semibold text-slate-700">{product.unit}</span>
          </div>
          {isNegative && (
            <span className="text-[10px] font-bold text-red-600">Below zero</span>
          )}
        </div>

        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Time Left
          </span>
          <div className="mt-0.5">
            {daysRemaining !== null ? (
              daysRemaining === Infinity ? (
                <span className="text-sm font-bold text-slate-700">Steady (0 sales)</span>
              ) : (
                <div className="flex items-baseline gap-1">
                  <span className={`text-base sm:text-lg font-bold ${statusConfig.accent}`}>
                    About {Math.max(0, Math.round(daysRemaining))}
                  </span>
                  <span className="text-xs font-semibold text-slate-700">days left</span>
                </div>
              )
            ) : (
              <span className="text-xs font-medium text-slate-600">Calculating...</span>
            )}
          </div>
          {velocity !== null && velocity > 0 && (
            <div className="text-[11px] text-slate-600">
              ~{Math.round(velocity * 10) / 10} {product.unit}/day sold
            </div>
          )}
        </div>
      </div>

      {/* Suggested Buy Banner (If running low or check soon) */}
      {suggestedPurchaseQuantity > 0 && (
        <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-300/60 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-600 text-white shadow-xs">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs sm:text-sm font-black text-amber-950">
                  Suggested: Buy {suggestedPurchaseQuantity} {product.unit}
                </div>
                <div className="text-[11px] text-amber-800">{explanation}</div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowWhyBuy(!showWhyBuy);
              }}
              className="flex items-center gap-0.5 text-[10px] font-bold text-amber-900 bg-white px-2 py-1 rounded-md border border-amber-200 hover:bg-amber-50 shrink-0"
            >
              <span>Why?</span>
              <Info className="h-3 w-3" />
            </button>
          </div>

          {/* Progressive Disclosure Why Box */}
          {showWhyBuy && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-2 rounded-lg bg-white p-2.5 border border-amber-200 text-[11px] text-slate-700 space-y-1"
            >
              <div>• <strong>Current stock:</strong> {product.currentStock} {product.unit} available in shop</div>
              <div>
                • <strong>Sales pace:</strong>{" "}
                {velocity !== null ? `About ${Math.round(velocity * 10) / 10} ${product.unit}/day` : "Based on minimum stock target"}
              </div>
              <div>• <strong>Target coverage:</strong> {product.desiredCoverageDays} days of stock</div>
              <div>• <strong>Formula:</strong> (Target stock) - (Current stock), rounded up to complete unit</div>
            </div>
          )}
        </div>
      )}

      {/* Explanation for OK or NO_DATA */}
      {suggestedPurchaseQuantity === 0 && (
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">{explanation}</p>
      )}

      {/* Negative Stock Warning */}
      {isNegative && (
        <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-red-100/70 p-2.5 text-xs text-red-900 border border-red-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-700 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Stock is below zero ({product.currentStock} {product.unit}).</p>
            <p className="text-[11px] text-red-800">Some sales may not have been recorded correctly.</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              openCountStock(product);
            }}
            className="shrink-0 rounded-lg bg-red-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-800 transition-colors"
          >
            Count Stock
          </button>
        </div>
      )}

      {/* Selling Price & Supplier Note */}
      <div className="mt-3 text-[11px] text-slate-500 border-t border-slate-100 pt-2 flex items-center justify-between">
        <span>
          Selling price:{" "}
          <strong className="text-slate-800 font-bold">
            {product.sellingPrice ? `₦${Number(product.sellingPrice).toLocaleString()}` : "Not set"}
          </strong>
        </span>

        {product.lastSupplierInfo && (
          <span>
            From <strong className="text-slate-700 font-semibold">{product.lastSupplierInfo.supplierName || "Supplier"}</strong>
            {isOwner && product.lastSupplierInfo.unitCost && (
              <span className="font-bold text-slate-800 ml-1">
                @ ₦{product.lastSupplierInfo.unitCost.toLocaleString()}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
        {suggestedPurchaseQuantity > 0 && (
          <button
            onClick={handleAddToList}
            disabled={isAdding || isAlreadyInBuyingList}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs sm:text-sm font-bold shadow-xs transition-all active:scale-95 ${
              isAlreadyInBuyingList
                ? "bg-slate-100 text-slate-500 cursor-default"
                : justAdded
                ? "bg-emerald-600 text-white"
                : "bg-amber-600 text-white hover:bg-amber-700 shadow-amber-600/20"
            }`}
          >
            {justAdded ? (
              <>
                <Check className="h-4 w-4" />
                <span>Added to Buying List!</span>
              </>
            ) : isAlreadyInBuyingList ? (
              <>
                <Check className="h-4 w-4" />
                <span>In Buying List</span>
              </>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4" />
                <span>Add to Buying List</span>
              </>
            )}
          </button>
        )}

        {/* Quick sale button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            openRecordSale(product);
          }}
          title="Record a sale for this product"
          className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700 transition-colors"
        >
          <TrendingDown className="h-3.5 w-3.5 text-red-600" />
          <span>Sale</span>
        </button>

        {/* Quick delivery button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            openRecordDelivery(product);
          }}
          title="Record a delivery for this product"
          className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
        >
          <Truck className="h-3.5 w-3.5 text-emerald-600" />
          <span>Delivery</span>
        </button>

        {/* Quick count button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            openCountStock(product);
          }}
          title="Count actual physical stock"
          className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 transition-colors"
        >
          <Scale className="h-3.5 w-3.5 text-amber-700" />
          <span>Count</span>
        </button>
      </div>
    </div>
  );
}
