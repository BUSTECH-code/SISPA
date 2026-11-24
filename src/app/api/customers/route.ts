import { NextResponse } from "next/server";
import { getAllCustomers, recordCustomerPayment } from "@/server/stockService";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { businessId, actorId } = await requireRouteBusinessContext(request);
    const customers = await getAllCustomers(businessId, actorId);

    const totalOutstandingDebt = customers.reduce(
      (sum, c) => sum + c.outstandingBalance,
      0
    );
    const debtorsCount = customers.filter((c) => c.outstandingBalance > 0).length;

    return NextResponse.json({
      success: true,
      data: {
        customers,
        totalOutstandingDebt,
        debtorsCount,
      },
    });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't load customer debt balances.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessId, actorId, actorName, userRole } = await requireRouteBusinessContext(request, body);
    const { customerId, amount, paymentMethod, notes, idempotencyKey } = body;

    const headerKey = request.headers.get("x-idempotency-key") || request.headers.get("x-client-tx-id");
    const resolvedIdempotencyKey = (idempotencyKey || headerKey)?.trim() || undefined;

    if (!customerId || isNaN(Number(customerId))) {
      return NextResponse.json(
        { success: false, error: "Please choose which customer made a payment." },
        { status: 400 }
      );
    }

    const payAmount = Number(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Enter a payment amount greater than 0." },
        { status: 400 }
      );
    }

    const payment = await recordCustomerPayment({
      businessId,
      actorId,
      actorName,
      actorRole: userRole,
      customerId: Number(customerId),
      amount: payAmount,
      paymentMethod: paymentMethod || "CASH",
      notes: notes?.trim() || undefined,
      idempotencyKey: resolvedIdempotencyKey,
    });

    return NextResponse.json({
      success: true,
      data: payment,
      message: "Payment recorded! Outstanding debt recovered.",
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to record payment.");
  }
}
