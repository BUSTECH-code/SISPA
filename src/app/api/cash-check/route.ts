import { NextResponse } from "next/server";
import { recordDailyCashCheck, getDailyCashChecks } from "@/server/stockService";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { businessId, actorId } = await requireRouteBusinessContext(request);
    const checks = await getDailyCashChecks(businessId, 14, actorId);

    return NextResponse.json({
      success: true,
      data: checks,
    });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't load cash checks.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessId, actorId, actorName, userRole } = await requireRouteBusinessContext(request, body);
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
      businessId,
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
    return handleRouteError(error, "Failed to record cash check.");
  }
}
