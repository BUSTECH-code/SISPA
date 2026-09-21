"use client";

import React, { useState, useMemo } from "react";
import { useStock } from "@/context/StockContext";
import { ProductCard } from "./ProductCard";
import {
  Search,
  Filter,
  Plus,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Scale,
  Boxes,
} from "lucide-react";

export function StockListView() {
  const { products, openAddProduct, openCountStock } = useStock();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category));
    return ["ALL", ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.unit.toLowerCase().includes(searchQuery.toLowerCase());

      // Category
      const matchesCategory = selectedCategory === "ALL" || p.category === selectedCategory;

      // Status
      let matchesStatus = true;
      if (statusFilter === "RUNNING_LOW") {
        matchesStatus = p.intelligence.status === "RUNNING_LOW";
      } else if (statusFilter === "CHECK_SOON") {
        matchesStatus = p.intelligence.status === "CHECK_SOON";
      } else if (statusFilter === "OK") {
        matchesStatus = p.intelligence.status === "OK";
      } else if (statusFilter === "NO_DATA") {
        matchesStatus = p.intelligence.status === "NO_DATA";
      } else if (statusFilter === "NEGATIVE") {
        matchesStatus = p.currentStock < 0;
      }

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchQuery, selectedCategory, statusFilter]);

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Shop Stock
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
              {products.length} products
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            What you physically have in your store and how fast each item moves.
          </p>
        </div>

        <button
          onClick={openAddProduct}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white shadow-sm shadow-amber-600/30 hover:bg-amber-700 active:scale-95 transition-all self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Add New Product</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by product name, category, or unit (e.g. Cement, Rebar, bags)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[48px] rounded-2xl border border-slate-300 bg-white pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
          />
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`min-h-[36px] rounded-xl px-3 text-xs font-bold transition-colors whitespace-nowrap ${
              statusFilter === "ALL"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All Items ({products.length})
          </button>

          <button
            onClick={() => setStatusFilter("RUNNING_LOW")}
            className={`flex items-center gap-1 min-h-[36px] rounded-xl px-3 text-xs font-bold transition-colors whitespace-nowrap ${
              statusFilter === "RUNNING_LOW"
                ? "bg-red-600 text-white"
                : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Buy Now ({products.filter((p) => p.intelligence.status === "RUNNING_LOW").length})</span>
          </button>

          <button
            onClick={() => setStatusFilter("CHECK_SOON")}
            className={`flex items-center gap-1 min-h-[36px] rounded-xl px-3 text-xs font-bold transition-colors whitespace-nowrap ${
              statusFilter === "CHECK_SOON"
                ? "bg-amber-600 text-white"
                : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Buy Soon ({products.filter((p) => p.intelligence.status === "CHECK_SOON").length})</span>
          </button>

          <button
            onClick={() => setStatusFilter("OK")}
            className={`flex items-center gap-1 min-h-[36px] rounded-xl px-3 text-xs font-bold transition-colors whitespace-nowrap ${
              statusFilter === "OK"
                ? "bg-emerald-600 text-white"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>OK ({products.filter((p) => p.intelligence.status === "OK").length})</span>
          </button>

          <button
            onClick={() => setStatusFilter("NO_DATA")}
            className={`flex items-center gap-1 min-h-[36px] rounded-xl px-3 text-xs font-bold transition-colors whitespace-nowrap ${
              statusFilter === "NO_DATA"
                ? "bg-slate-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>No Data ({products.filter((p) => p.intelligence.status === "NO_DATA").length})</span>
          </button>

          {products.some((p) => p.currentStock < 0) && (
            <button
              onClick={() => setStatusFilter("NEGATIVE")}
              className={`flex items-center gap-1 min-h-[36px] rounded-xl px-3 text-xs font-bold transition-colors whitespace-nowrap ${
                statusFilter === "NEGATIVE"
                  ? "bg-red-800 text-white"
                  : "bg-red-100 text-red-900 border border-red-300"
              }`}
            >
              <Scale className="h-3.5 w-3.5" />
              <span>Below Zero ({products.filter((p) => p.currentStock < 0).length})</span>
            </button>
          )}
        </div>

        {/* Category Pill Filters */}
        {categories.length > 2 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 font-medium pl-1">Category:</span>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-lg px-2.5 py-1 font-semibold transition-colors whitespace-nowrap ${
                  selectedCategory === cat
                    ? "bg-amber-100 text-amber-900 border border-amber-300"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {cat === "ALL" ? "All Categories" : cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product Grid */}
      {filteredProducts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <Boxes className="mx-auto h-8 w-8 text-slate-400 mb-2" />
          <h3 className="text-sm font-bold text-slate-800">
            {products.length === 0
              ? "No products added yet."
              : "No products match your search or filter."}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {products.length === 0
              ? "Get started by adding the building materials you sell in your shop."
              : "Try searching for a different product name, or reset your filters."}
          </p>
          <button
            onClick={() => {
              if (products.length === 0) {
                openAddProduct();
              } else {
                setSearchQuery("");
                setSelectedCategory("ALL");
                setStatusFilter("ALL");
              }
            }}
            className="mt-3 text-xs font-bold text-amber-700 hover:underline"
          >
            {products.length === 0 ? "Add First Product" : "Reset all filters"}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
