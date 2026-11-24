import { NextResponse } from "next/server";
import { getAllExpenses, recordExpense } from "@/server/stockService";
import { requireRouteBusinessContext } from "@/server/authService";
import { assertCan } from "@/server/authorization";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { businessId, actorId, authContext } = await requireRouteBusinessContext(request);
    assertCan(authContext, "EXPENSE_VIEW", { businessId });

    const list = await getAllExpenses(businessId, actorId);
    const totalExpenses = list.reduce((sum, e) => sum + Number(e.amount), 0);

    return NextResponse.json({
      success: true,
      data: {
        expenses: list,
        totalExpenses,
      },
    });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't load shop expenses.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessId, actorId, actorName, userRole } = await requireRouteBusinessContext(request, body);
    const { title, category, amount, paymentMethod, notes } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { success: false, error: "Please enter what this money was spent on." },
        { status: 400 }
      );
    }

    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) {
      return NextResponse.json(
        { success: false, error: "Enter an expense amount greater than 0." },
        { status: 400 }
      );
    }

    const expense = await recordExpense({
      businessId,
      actorId,
      actorName,
      actorRole: userRole,
      title: title.trim(),
      category: category ? String(category).trim() : "Shop Operations",
      amount: amt,
      paymentMethod: paymentMethod || "CASH",
      notes: notes?.trim() || undefined,
    });

    return NextResponse.json({
      success: true,
      data: expense,
      message: "Expense recorded! Business reports updated.",
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to record expense.");
  }
}
