import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentSession,
  listUserActiveBusinesses,
  parsePositiveBusinessId,
  setSessionActiveBusiness,
  ActiveBusinessRequiredError,
} from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const current = await getCurrentSession();
    if (!current) {
      return NextResponse.json(
        { success: false, code: "UNAUTHORIZED", error: "Please log in." },
        { status: 401 }
      );
    }

    const availableBusinesses = await listUserActiveBusinesses(current.user.id);
    return NextResponse.json({
      success: true,
      data: {
        activeBusinessId: current.session.activeBusinessId ?? null,
        availableBusinesses,
      },
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to load available businesses.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const current = await getCurrentSession();
    if (!current) {
      return NextResponse.json(
        { success: false, code: "UNAUTHORIZED", error: "Please log in." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const targetBusinessId = parsePositiveBusinessId(body?.activeBusinessId ?? body?.businessId);
    if (!targetBusinessId) {
      throw new ActiveBusinessRequiredError();
    }

    const ctx = await setSessionActiveBusiness({
      sessionId: current.session.id,
      userId: current.user.id,
      businessId: targetBusinessId,
    });
    const availableBusinesses = await listUserActiveBusinesses(current.user.id);

    return NextResponse.json({
      success: true,
      data: {
        activeBusinessId: ctx.business.id,
        business: ctx.business,
        role: ctx.membership.role,
        delegatedCapabilities: ctx.membership.customCapabilities,
        availableBusinesses,
      },
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to select active business.");
  }
}
