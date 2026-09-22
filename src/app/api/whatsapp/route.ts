import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, resolveBusinessContext } from "@/server/authService";
import {
  getAllEnrichedProducts,
  getAllCustomers,
  recordSale,
  recordDelivery,
  recordCustomerPayment,
  getBusinessPeriodReport,
} from "@/server/stockService";
import {
  parseNaturalLanguageInput,
  formatWhatsAppWeeklyBriefing,
  type ParsedBusinessAction,
} from "@/domain/nlpAssistant";

export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp - Webhook verification for Meta WhatsApp Cloud API
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "sispa_secret_token";

  if (mode === "subscribe" && token === expectedToken) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ status: "active", interface: "SISPA 1.0 WhatsApp Business Assistant" });
}

/**
 * POST /api/whatsapp - Processes incoming WhatsApp messages and interactive testing simulator
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Please log in to use the assistant." }, { status: 401 });
    }

    const { businessId, userRole, actorId, actorName } = resolveBusinessContext(user);

    const body = await request.json();
    const { message, executeAction, actionData } = body;

    // 1. If executing a confirmed structured action
    if (executeAction && actionData) {
      const { intent, productId, quantity, customerId, amount, supplierName } = actionData;

      if (intent === "RECORD_SALE") {
        await recordSale({
          userId: businessId,
          actorId,
          actorName,
          actorRole: userRole,
          productId: Number(productId),
          quantity: Number(quantity),
          customerId: customerId ? Number(customerId) : undefined,
          notes: "Recorded via WhatsApp Assistant",
          source: "WHATSAPP",
        });
        return NextResponse.json({
          success: true,
          replyText: `✅ *Sale Recorded!*\nSubtracted ${quantity} items. Stock has been updated.`,
          executed: true,
        });
      }

      if (intent === "RECORD_PAYMENT") {
        await recordCustomerPayment({
          userId: businessId,
          actorId,
          actorName,
          actorRole: userRole,
          customerId: Number(customerId),
          amount: Number(amount),
          notes: "Recorded via WhatsApp Assistant",
          source: "WHATSAPP",
        });
        return NextResponse.json({
          success: true,
          replyText: `✅ *Payment Recorded!*\nRecovered ₦${Number(amount).toLocaleString()} towards debt. Customer balance updated.`,
          executed: true,
        });
      }

      if (intent === "RECORD_DELIVERY") {
        await recordDelivery({
          userId: businessId,
          actorId,
          actorName,
          actorRole: userRole,
          productId: Number(productId),
          quantityReceived: Number(quantity),
          supplierName: supplierName || undefined,
          notes: "Recorded via WhatsApp Assistant",
          source: "WHATSAPP",
        });
        return NextResponse.json({
          success: true,
          replyText: `✅ *Delivery Confirmed!*\nReceived +${quantity} items into stock${supplierName ? ` from ${supplierName}` : ""}.`,
          executed: true,
        });
      }
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ success: false, error: "Empty message." }, { status: 400 });
    }

    // Load business authoritative data (Tenant-isolated)
    const [products, customers] = await Promise.all([
      getAllEnrichedProducts(businessId, userRole),
      getAllCustomers(businessId),
    ]);

    // Parse natural language using the domain engine
    const parsed: ParsedBusinessAction = parseNaturalLanguageInput({
      text: message,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        sellingPrice: p.sellingPrice,
      })),
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        outstandingBalance: c.outstandingBalance,
      })),
    });

    // Handle Query Intents
    if (parsed.intent === "QUERY_DEBT") {
      const debtors = customers.filter((c) => c.outstandingBalance > 0);
      const totalDebt = debtors.reduce((sum, c) => sum + c.outstandingBalance, 0);

      if (debtors.length === 0) {
        return NextResponse.json({
          success: true,
          replyText: `🎉 *No customers currently owe your shop!* All accounts are settled.`,
          parsed,
        });
      }

      let reply = `💳 *MONEY OWED (${debtors.length} Customers)*\nTotal Outstanding: *₦${totalDebt.toLocaleString()}*\n\n`;
      debtors.slice(0, 5).forEach((d, idx) => {
        reply += `${idx + 1}. *${d.name}*: ₦${d.outstandingBalance.toLocaleString()}\n`;
      });
      if (debtors.length > 5) {
        reply += `_...and ${debtors.length - 5} more customers._\n`;
      }
      reply += `\n_To record a collection, type e.g. "${debtors[0].name.split(" ")[0]} paid 50k"_`;

      return NextResponse.json({ success: true, replyText: reply, parsed });
    }

    if (parsed.intent === "QUERY_BUYING") {
      const urgentProducts = products.filter(
        (p) => p.intelligence.status === "RUNNING_LOW" || p.intelligence.status === "CHECK_SOON"
      );

      if (urgentProducts.length === 0) {
        return NextResponse.json({
          success: true,
          replyText: `🟢 *Stock is healthy!* No products are running out right now.`,
          parsed,
        });
      }

      let reply = `📦 *WHAT TO BUY (${urgentProducts.length} Products)*\n\n`;
      urgentProducts.slice(0, 5).forEach((p, idx) => {
        const days = p.intelligence.daysRemaining !== null && p.intelligence.daysRemaining < Infinity
          ? `(~${Math.round(p.intelligence.daysRemaining)} days left)`
          : "";
        reply += `${idx + 1}. *${p.name}*\n   Left: ${p.currentStock} ${p.unit} ${days}\n   👉 *Suggested buy: ${p.intelligence.suggestedPurchaseQuantity} ${p.unit}*\n`;
      });

      return NextResponse.json({ success: true, replyText: reply, parsed });
    }

    if (parsed.intent === "QUERY_REPORT") {
      // Capability check: Staff cannot access financial reports
      if (userRole === "STAFF") {
        return NextResponse.json({
          success: true,
          replyText: `🔒 *Access Restricted*\nDetailed shop financial summaries and business reports are reserved for the shop owner.`,
          parsed,
        });
      }

      const report = await getBusinessPeriodReport(businessId, 7, userRole);
      const urgentItems = products
        .filter((p) => p.intelligence.status === "RUNNING_LOW")
        .map((p) => ({
          name: p.name,
          currentStock: p.currentStock,
          unit: p.unit,
          suggestedBuy: p.intelligence.suggestedPurchaseQuantity,
        }));

      const reply = formatWhatsAppWeeklyBriefing({
        businessName: user.businessName,
        totalSalesValue: report.metrics.totalSalesValue,
        salesCount: report.metrics.salesCount,
        cashCollected: report.metrics.cashCollected,
        newCreditIssued: report.metrics.newCreditIssued,
        debtRecovered: report.metrics.debtRecovered,
        totalCustomerDebt: report.metrics.closingDebt,
        urgentStockItems: urgentItems,
        topDebtors: report.topDebtors,
      });

      return NextResponse.json({ success: true, replyText: reply, parsed });
    }

    if (parsed.intent === "QUERY_STOCK") {
      if (parsed.matchedProductId) {
        const prod = products.find((p) => p.id === parsed.matchedProductId);
        if (prod) {
          const days = prod.intelligence.daysRemaining !== null && prod.intelligence.daysRemaining < Infinity
            ? `About ${Math.round(prod.intelligence.daysRemaining)} days left.`
            : "";
          return NextResponse.json({
            success: true,
            replyText: `📦 *${prod.name}*\n• Current Stock: *${prod.currentStock} ${prod.unit}*\n• Status: *${prod.intelligence.statusLabel}*\n• ${days || prod.intelligence.explanation}`,
            parsed,
          });
        }
      }

      // Overview of shop stock
      const low = products.filter((p) => p.intelligence.status === "RUNNING_LOW").length;
      const ok = products.filter((p) => p.intelligence.status === "OK").length;
      return NextResponse.json({
        success: true,
        replyText: `📦 *SHOP STOCK OVERVIEW*\n• Total Products: ${products.length}\n• Buy Now (Urgent): ${low}\n• Healthy (OK): ${ok}\n\n_Type "stock [product name]" to check a specific item._`,
        parsed,
      });
    }

    // Action requiring confirmation (SALE, PAYMENT, DELIVERY)
    if (!parsed.isAmbiguous && parsed.confirmationMessage) {
      return NextResponse.json({
        success: true,
        replyText: `🤖 ${parsed.confirmationMessage}\n\n_Tap "Confirm" below or reply "Yes"_`,
        actionPending: true,
        parsed,
      });
    }

    // Clarification required (ambiguous input)
    return NextResponse.json({
      success: true,
      replyText: `❓ ${parsed.clarificationPrompt || "Could you clarify what you'd like to do?"}`,
      parsed,
    });
  } catch (error: any) {
    console.error("WhatsApp Assistant error:", error);
    return NextResponse.json(
      { success: false, error: "Error processing your request. Please try again." },
      { status: 500 }
    );
  }
}
