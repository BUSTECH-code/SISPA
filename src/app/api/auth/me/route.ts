import { NextResponse } from "next/server";
import {
  getCurrentSession,
  destroySession,
  listUserActiveBusinesses,
  requireActiveBusinessContext,
  SESSION_COOKIE_NAME,
} from "@/server/authService";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const current = await getCurrentSession();
    if (!current) {
      return NextResponse.json({
        success: true,
        data: { user: null, activeBusinessId: null, activeBusiness: null, availableBusinesses: [] },
      });
    }

    const { user, session } = current;
    const availableBusinesses = await listUserActiveBusinesses(user.id);

    let activeBusinessId: number | null = session.activeBusinessId ?? null;
    let activeBusiness: { id: number; name: string; currency: string; state: string } | null = null;
    let effectiveRole = user.role;
    let delegatedCapabilities: string[] = [];

    if (activeBusinessId) {
      try {
        const authCtx = await requireActiveBusinessContext({
          userId: user.id,
          activeBusinessId,
        });
        activeBusiness = {
          id: authCtx.business.id,
          name: authCtx.business.name,
          currency: authCtx.business.currency,
          state: authCtx.business.state,
        };
        effectiveRole = authCtx.membership.role;
        const rawCaps = authCtx.membership.customCapabilities;
        delegatedCapabilities =
          rawCaps && Array.isArray(rawCaps) && rawCaps.length > 0
            ? rawCaps
            : effectiveRole === "STAFF"
            ? ["CAN_SELL", "CAN_RECEIVE", "CAN_COLLECT", "CAN_COUNT"]
            : [];
      } catch {
        // Bound business is no longer active or accessible — do NOT infer another business
        activeBusinessId = null;
        activeBusiness = null;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: effectiveRole,
          businessName: activeBusiness?.name ?? user.businessName,
          businessOwnerId: user.businessOwnerId,
          isPlatformAdmin: !!user.isPlatformAdmin,
          delegatedCapabilities,
          activeBusinessId,
        },
        activeBusinessId,
        activeBusiness,
        availableBusinesses,
      },
    });
  } catch {
    return NextResponse.json({
      success: true,
      data: { user: null, activeBusinessId: null, activeBusiness: null, availableBusinesses: [] },
    });
  }
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (sessionId) {
      await destroySession(sessionId);
    }

    const response = NextResponse.json({
      success: true,
      message: "Logged out successfully.",
    });

    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to log out." },
      { status: 500 }
    );
  }
}
