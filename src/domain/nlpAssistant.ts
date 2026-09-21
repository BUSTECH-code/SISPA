/**
 * SISPA Natural Language Assistant Engine
 * 
 * Rules:
 * - Deterministic, conservative natural language parsing.
 * - Never guess quantities, products, or customers when ambiguous.
 * - Always produce structured business actions with confidence/clarification requirements.
 * - Connects directly to authoritative domain facts.
 */

export type NlpIntent =
  | "RECORD_SALE"
  | "RECORD_DELIVERY"
  | "RECORD_PAYMENT"
  | "QUERY_STOCK"
  | "QUERY_DEBT"
  | "QUERY_BUYING"
  | "QUERY_REPORT"
  | "UNKNOWN";

export interface ParsedBusinessAction {
  intent: NlpIntent;
  confidence: number;
  rawText: string;
  isAmbiguous: boolean;
  clarificationPrompt?: string;
  
  // Extracted entities
  productSearchTerm?: string;
  matchedProductId?: number;
  matchedProductName?: string;

  quantity?: number;
  unitPrice?: number;
  amount?: number;

  customerSearchTerm?: string;
  matchedCustomerId?: number;
  matchedCustomerName?: string;

  supplierName?: string;

  confirmationMessage?: string;
}

/**
 * Clean and normalize text for parsing
 */
function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/[,\-_]/g, " ");
}

/**
 * Parse currency/number values like "100k" -> 100000, "50.5" -> 50.5, "₦85,000" -> 85000
 */
export function parseFuzzyNumber(text: string): number | null {
  const cleaned = text.toLowerCase().replace(/[₦$,\s]/g, "");
  if (!cleaned) return null;

  if (cleaned.endsWith("k")) {
    const base = parseFloat(cleaned.slice(0, -1));
    return isNaN(base) ? null : base * 1000;
  }
  if (cleaned.endsWith("m")) {
    const base = parseFloat(cleaned.slice(0, -1));
    return isNaN(base) ? null : base * 1000000;
  }

  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

/**
 * Parse natural language text into a structured business action or query.
 */
export function parseNaturalLanguageInput(params: {
  text: string;
  products: Array<{ id: number; name: string; unit: string; sellingPrice?: string | null }>;
  customers: Array<{ id: number; name: string; outstandingBalance: number }>;
}): ParsedBusinessAction {
  const { text, products, customers } = params;
  const normalized = normalize(text);

  // 1. QUERY INTENTS
  if (
    normalized.includes("who owe") ||
    normalized.includes("who owes") ||
    normalized.includes("debt") ||
    normalized.includes("money owed")
  ) {
    return {
      intent: "QUERY_DEBT",
      confidence: 0.95,
      rawText: text,
      isAmbiguous: false,
    };
  }

  if (
    normalized.includes("what to buy") ||
    normalized.includes("what do i need to buy") ||
    normalized.includes("what should i buy") ||
    normalized.includes("buying list") ||
    normalized.includes("low stock")
  ) {
    return {
      intent: "QUERY_BUYING",
      confidence: 0.95,
      rawText: text,
      isAmbiguous: false,
    };
  }

  if (
    normalized.includes("report") ||
    normalized.includes("summary") ||
    normalized.includes("how did we do") ||
    normalized.includes("performance")
  ) {
    return {
      intent: "QUERY_REPORT",
      confidence: 0.95,
      rawText: text,
      isAmbiguous: false,
    };
  }

  if (
    normalized.startsWith("stock") ||
    normalized.includes("how much stock") ||
    normalized.includes("how many do i have") ||
    normalized.includes("stock count")
  ) {
    const matchedProd = products.find((p) => normalized.includes(p.name.toLowerCase()));
    return {
      intent: "QUERY_STOCK",
      confidence: 0.9,
      rawText: text,
      isAmbiguous: false,
      productSearchTerm: matchedProd?.name,
      matchedProductId: matchedProd?.id,
      matchedProductName: matchedProd?.name,
    };
  }

  // 2. RESTOCK DELIVERY: Check for physical delivery arrivals
  const isDeliveryTrigger =
    normalized.startsWith("received") ||
    normalized.startsWith("delivery") ||
    normalized.includes(" arrived") ||
    normalized.includes("restock");

  // Check if a known product is mentioned in text
  const matchedDeliveryProducts = products.filter((p) => {
    const pTokens = p.name.toLowerCase().split(/\s+/);
    return pTokens.some((tok) => tok.length > 3 && normalized.includes(tok));
  });

  if (isDeliveryTrigger && (matchedDeliveryProducts.length > 0 || normalized.includes(" from "))) {
    const tokens = normalized.split(/\s+/);
    let qty: number | null = null;

    for (const tok of tokens) {
      const num = parseFuzzyNumber(tok);
      if (num !== null && num > 0) {
        qty = num;
        break;
      }
    }

    if (qty === null) {
      return {
        intent: "RECORD_DELIVERY",
        confidence: 0.5,
        rawText: text,
        isAmbiguous: true,
        clarificationPrompt: "How many items arrived in this delivery?",
      };
    }

    if (matchedDeliveryProducts.length === 0) {
      return {
        intent: "RECORD_DELIVERY",
        confidence: 0.6,
        rawText: text,
        quantity: qty,
        isAmbiguous: true,
        clarificationPrompt: "Which product arrived?",
      };
    }

    const prod = matchedDeliveryProducts[0];

    let supplier: string | undefined;
    if (normalized.includes(" from ")) {
      supplier = text.split(/ from /i)[1]?.trim();
    }

    return {
      intent: "RECORD_DELIVERY",
      confidence: 0.95,
      rawText: text,
      quantity: qty,
      matchedProductId: prod.id,
      matchedProductName: prod.name,
      supplierName: supplier,
      isAmbiguous: false,
      confirmationMessage: `Record delivery: +${qty} ${prod.unit} of "${prod.name}"${supplier ? ` from ${supplier}` : ""}?`,
    };
  }

  // 3. SALE: "Sold 20 cement to Musa" / "sold 5 blocks"
  if (normalized.startsWith("sold") || normalized.includes(" sold ") || normalized.startsWith("sell ")) {
    const tokens = normalized.split(/\s+/);
    let qty: number | null = null;

    for (let i = 0; i < tokens.length; i++) {
      const num = parseFuzzyNumber(tokens[i]);
      if (num !== null && num > 0) {
        qty = num;
        break;
      }
    }

    if (qty === null) {
      return {
        intent: "RECORD_SALE",
        confidence: 0.5,
        rawText: text,
        isAmbiguous: true,
        clarificationPrompt: "How many did you sell? (Please include quantity)",
      };
    }

    const matchedProducts = products.filter((p) => {
      const pTokens = p.name.toLowerCase().split(/\s+/);
      return pTokens.some((tok) => tok.length > 3 && normalized.includes(tok));
    });

    if (matchedProducts.length === 0) {
      return {
        intent: "RECORD_SALE",
        confidence: 0.6,
        rawText: text,
        quantity: qty,
        isAmbiguous: true,
        clarificationPrompt: "Which product was sold?",
      };
    }

    if (matchedProducts.length > 1) {
      const exact = matchedProducts.find((p) => normalized.includes(p.name.toLowerCase()));
      if (!exact) {
        return {
          intent: "RECORD_SALE",
          confidence: 0.7,
          rawText: text,
          quantity: qty,
          isAmbiguous: true,
          clarificationPrompt: `Which product did you mean? (${matchedProducts.map((p) => p.name).join(" OR ")})`,
        };
      }
    }

    const prod = matchedProducts[0];

    let matchedCustomer: (typeof customers)[0] | undefined;
    if (normalized.includes(" to ")) {
      const afterTo = normalized.split(" to ")[1]?.trim();
      if (afterTo) {
        matchedCustomer = customers.find(
          (c) => afterTo.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(afterTo)
        );
      }
    }

    return {
      intent: "RECORD_SALE",
      confidence: 0.95,
      rawText: text,
      quantity: qty,
      matchedProductId: prod.id,
      matchedProductName: prod.name,
      matchedCustomerId: matchedCustomer?.id,
      matchedCustomerName: matchedCustomer?.name,
      isAmbiguous: false,
      confirmationMessage: `Record sale: ${qty} ${prod.unit} of "${prod.name}"${
        matchedCustomer ? ` to ${matchedCustomer.name}` : ""
      }?`,
    };
  }

  // 4. CUSTOMER PAYMENT: "Musa paid 100k" / "payment of 50000 from Patrick"
  if (
    normalized.includes(" paid ") ||
    normalized.startsWith("paid ") ||
    normalized.includes("payment") ||
    normalized.includes("recovered")
  ) {
    const tokens = normalized.split(/\s+/);
    let amount: number | null = null;

    for (const tok of tokens) {
      const num = parseFuzzyNumber(tok);
      if (num !== null && num >= 100) {
        amount = num;
        break;
      }
    }

    if (amount === null) {
      return {
        intent: "RECORD_PAYMENT",
        confidence: 0.5,
        rawText: text,
        isAmbiguous: true,
        clarificationPrompt: "How much did the customer pay?",
      };
    }

    const matchedCust = customers.filter((c) => {
      const nameParts = c.name.toLowerCase().split(/\s+/);
      return nameParts.some((part) => part.length >= 3 && normalized.includes(part));
    });

    if (matchedCust.length === 0) {
      return {
        intent: "RECORD_PAYMENT",
        confidence: 0.6,
        rawText: text,
        amount,
        isAmbiguous: true,
        clarificationPrompt: "Which customer paid this amount?",
      };
    }

    if (matchedCust.length > 1) {
      return {
        intent: "RECORD_PAYMENT",
        confidence: 0.7,
        rawText: text,
        amount,
        isAmbiguous: true,
        clarificationPrompt: `Which customer do you mean? (${matchedCust.map((c) => c.name).join(" OR ")})`,
      };
    }

    const customer = matchedCust[0];

    return {
      intent: "RECORD_PAYMENT",
      confidence: 0.95,
      rawText: text,
      amount,
      matchedCustomerId: customer.id,
      matchedCustomerName: customer.name,
      isAmbiguous: false,
      confirmationMessage: `Record payment: ₦${amount.toLocaleString()} received from "${
        customer.name
      }"? (Current debt: ₦${customer.outstandingBalance.toLocaleString()})`,
    };
  }

  return {
    intent: "UNKNOWN",
    confidence: 0.1,
    rawText: text,
    isAmbiguous: true,
    clarificationPrompt:
      "I didn't quite catch that. You can say e.g. 'Sold 10 cement to Patrick', 'Patrick paid 50k', 'Who owes me?', or 'What should I buy?'",
  };
}

/**
 * Format executive weekly business report for WhatsApp readability.
 */
export function formatWhatsAppWeeklyBriefing(params: {
  businessName: string;
  totalSalesValue: number;
  salesCount: number;
  cashCollected: number;
  newCreditIssued: number;
  debtRecovered: number;
  totalCustomerDebt: number;
  urgentStockItems: Array<{ name: string; currentStock: number; unit: string; suggestedBuy: number }>;
  topDebtors: Array<{ name: string; outstandingBalance: number }>;
}): string {
  const {
    businessName,
    totalSalesValue,
    salesCount,
    cashCollected,
    newCreditIssued,
    debtRecovered,
    totalCustomerDebt,
    urgentStockItems,
    topDebtors,
  } = params;

  let msg = `📊 *${businessName.toUpperCase()} — WEEKLY BRIEFING*\n\n`;

  msg += `💰 *SALES & CASH*\n`;
  msg += `• Total Sales: ₦${totalSalesValue.toLocaleString()} (${salesCount} sales)\n`;
  msg += `• Cash Collected: ₦${cashCollected.toLocaleString()}\n`;
  msg += `• Debt Recovered: ₦${debtRecovered.toLocaleString()}\n\n`;

  msg += `💳 *CUSTOMER DEBT*\n`;
  msg += `• New Credit Issued: ₦${newCreditIssued.toLocaleString()}\n`;
  msg += `• Total Money Owed Now: ₦${totalCustomerDebt.toLocaleString()}\n`;
  if (topDebtors.length > 0) {
    msg += `Top debtor: ${topDebtors[0].name} (₦${topDebtors[0].outstandingBalance.toLocaleString()})\n`;
  }
  msg += `\n`;

  msg += `📦 *STOCK ATTENTION*\n`;
  if (urgentStockItems.length === 0) {
    msg += `• All fast-moving stock is healthy!\n`;
  } else {
    msg += `• ${urgentStockItems.length} products running low:\n`;
    for (const item of urgentStockItems.slice(0, 3)) {
      msg += `  - ${item.name}: ${item.currentStock} ${item.unit} left (Suggested buy: ${item.suggestedBuy})\n`;
    }
  }

  msg += `\n_Reply with "Who owes me?", "What to buy?", or log a sale._`;
  return msg;
}
