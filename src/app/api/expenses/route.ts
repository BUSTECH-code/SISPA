import { NextResponse } from "next/server";
import { getAllExpenses, recordExpense } from "@/server/stockService";
import { requireAuth, resolveBusinessContext, getAuthContextForUser } from "@/server/authService";
import { assertCan } from "@/server/authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    const { businessId, userRole } = resolveBusinessContext(user);

    const authCtx = await getAuthContextForUser(user.id, userRole);
    assertCan(authCtx, "EXPENSE_VIEW", { businessId });

    const list = await getAllExpenses(businessId);
    const totalExpenses = list.reduce((sum, e) => sum + Number(e.amount), 0);

    return NextResponse.json({
      success: true,
      data: {
        expenses: list,
        totalExpenses,
      },
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    if (error.message?.startsWith("FORBIDDEN") || error.message?.startsWith("STAFF")) {
      return NextResponse.json(
        { success: false, error: "Shop expense records are restricted to the business owner." },
        { status: 403 }
      );
    }
    console.error("Failed to load expenses:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't load shop expenses." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { businessId, actorId, actorName, userRole } = resolveBusinessContext(user);
    const body = await request.json();
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
      userId: businessId,
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
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to record expense:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to record expense." },
      { status: 400 }
    );
  }
}
