import { NextResponse } from "next/server";
import { getAllCustomers, recordCustomerPayment } from "@/server/stockService";
import { requireAuth, resolveBusinessContext } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    const { businessId } = resolveBusinessContext(user);
    const customers = await getAllCustomers(businessId);

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
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to load customers:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't load customer debt balances." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { businessId, actorId, actorName, userRole } = resolveBusinessContext(user);
    const body = await request.json();
    const { customerId, amount, paymentMethod, notes } = body;

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
      userId: businessId,
      actorId,
      actorName,
      actorRole: userRole,
      customerId: Number(customerId),
      amount: payAmount,
      paymentMethod: paymentMethod || "CASH",
      notes: notes?.trim() || undefined,
    });

    return NextResponse.json({
      success: true,
      data: payment,
      message: "Payment recorded! Outstanding debt recovered.",
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to record customer payment:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to record payment." },
      { status: 400 }
    );
  }
}
