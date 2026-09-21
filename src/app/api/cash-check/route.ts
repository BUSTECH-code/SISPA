import { NextResponse } from "next/server";
import { recordDailyCashCheck, getDailyCashChecks } from "@/server/stockService";
import { requireAuth, resolveBusinessContext } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    const { businessId } = resolveBusinessContext(user);

    const checks = await getDailyCashChecks(businessId, 14);

    return NextResponse.json({
      success: true,
      data: checks,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to load cash checks:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't load cash checks." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { businessId, actorId, actorName, userRole } = resolveBusinessContext(user);

    const body = await request.json();
    const { checkDate, actualCash, notes } = body;

    const actual = Number(actualCash);
    if (isNaN(actual) || actual < 0) {
      return NextResponse.json(
        { success: false, error: "Enter a valid actual cash amount." },
        { status: 400 }
      );
    }

    const todayStr = checkDate || new Date().toISOString().split("T")[0];

    const result = await recordDailyCashCheck({
      userId: businessId,
      actorId,
      actorName,
      actorRole: userRole,
      checkDate: todayStr,
      actualCash: actual,
      notes,
    });

    const diff = Number(result.difference);
    let message = "Cash check recorded! ";
    if (diff === 0) {
      message += "Actual cash matches today's recorded business movement exactly.";
    } else if (diff < 0) {
      message += `There is a ₦${Math.abs(diff).toLocaleString()} difference (short) to check.`;
    } else {
      message += `There is a ₦${Math.abs(diff).toLocaleString()} difference (extra) to check.`;
    }

    return NextResponse.json({
      success: true,
      data: result,
      message,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to record cash check:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to record cash check." },
      { status: 400 }
    );
  }
}
