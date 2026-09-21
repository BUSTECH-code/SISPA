import { describe, it, expect } from "vitest";
import { parseNaturalLanguageInput, parseFuzzyNumber, formatWhatsAppWeeklyBriefing } from "./nlpAssistant";

describe("SISPA NLP Assistant & WhatsApp Intent Engine", () => {
  const mockProducts = [
    { id: 1, name: "Dangote 3X Cement 50kg", unit: "bags", sellingPrice: "9200" },
    { id: 2, name: "TMT High-Yield Rebar 12mm", unit: "lengths", sellingPrice: "6800" },
  ];

  const mockCustomers = [
    { id: 101, name: "Engr. Patrick Site Lead", outstandingBalance: 216800 },
    { id: 102, name: "Musa Plumber", outstandingBalance: 42800 },
  ];

  it("parses numbers with k and m suffixes accurately", () => {
    expect(parseFuzzyNumber("100k")).toBe(100000);
    expect(parseFuzzyNumber("50.5k")).toBe(50500);
    expect(parseFuzzyNumber("1.5m")).toBe(1500000);
    expect(parseFuzzyNumber("₦85,000")).toBe(85000);
    expect(parseFuzzyNumber("20")).toBe(20);
  });

  it("interprets 'Sold 20 cement to Musa' into structured sale event", () => {
    const res = parseNaturalLanguageInput({
      text: "Sold 20 cement to Musa",
      products: mockProducts,
      customers: mockCustomers,
    });

    expect(res.intent).toBe("RECORD_SALE");
    expect(res.quantity).toBe(20);
    expect(res.matchedProductId).toBe(1);
    expect(res.matchedCustomerId).toBe(102);
    expect(res.isAmbiguous).toBe(false);
  });

  it("interprets 'Musa paid 100k' into structured debt recovery payment", () => {
    const res = parseNaturalLanguageInput({
      text: "Musa paid 100k",
      products: mockProducts,
      customers: mockCustomers,
    });

    expect(res.intent).toBe("RECORD_PAYMENT");
    expect(res.amount).toBe(100000);
    expect(res.matchedCustomerId).toBe(102);
    expect(res.isAmbiguous).toBe(false);
  });

  it("interprets 'Received 50 cement from ABC' into structured restock delivery", () => {
    const res = parseNaturalLanguageInput({
      text: "Received 50 cement from ABC",
      products: mockProducts,
      customers: mockCustomers,
    });

    expect(res.intent).toBe("RECORD_DELIVERY");
    expect(res.quantity).toBe(50);
    expect(res.matchedProductId).toBe(1);
    expect(res.supplierName).toBe("ABC");
    expect(res.isAmbiguous).toBe(false);
  });

  it("identifies business query intents correctly", () => {
    expect(
      parseNaturalLanguageInput({ text: "Who owes me?", products: mockProducts, customers: mockCustomers }).intent
    ).toBe("QUERY_DEBT");

    expect(
      parseNaturalLanguageInput({ text: "What do I need to buy?", products: mockProducts, customers: mockCustomers }).intent
    ).toBe("QUERY_BUYING");

    expect(
      parseNaturalLanguageInput({ text: "How did we do this week? Report", products: mockProducts, customers: mockCustomers }).intent
    ).toBe("QUERY_REPORT");
  });

  it("handles ambiguity conservatively when quantity is missing", () => {
    const res = parseNaturalLanguageInput({
      text: "Musa took cement",
      products: mockProducts,
      customers: mockCustomers,
    });

    // Does not guess quantity
    expect(res.isAmbiguous).toBe(true);
  });

  it("formats readable WhatsApp weekly briefing", () => {
    const text = formatWhatsAppWeeklyBriefing({
      businessName: "Musa Building Materials",
      totalSalesValue: 1250000,
      salesCount: 15,
      cashCollected: 1000000,
      newCreditIssued: 250000,
      debtRecovered: 180000,
      totalCustomerDebt: 320000,
      urgentStockItems: [{ name: "Dangote Cement", currentStock: 12, unit: "bags", suggestedBuy: 70 }],
      topDebtors: [{ name: "Engr. Patrick", outstandingBalance: 200000 }],
    });

    expect(text).toContain("MUSA BUILDING MATERIALS — WEEKLY BRIEFING");
    expect(text).toContain("Total Sales: ₦1,250,000");
    expect(text).toContain("Debt Recovered: ₦180,000");
    expect(text).toContain("Dangote Cement: 12 bags left");
  });
});
