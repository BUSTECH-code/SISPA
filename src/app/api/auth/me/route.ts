import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, destroySession, SESSION_COOKIE_NAME, getAuthContextForUser } from "@/server/authService";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: true, data: { user: null } });
    }

    const userRole = user.role === "STAFF" ? "STAFF" : user.role === "OWNER" ? "OWNER" : undefined;
    const authCtx = await getAuthContextForUser(user.id, userRole);
    const delegatedCapabilities =
      authCtx?.membership?.customCapabilities ||
      (user.role === "STAFF" ? ["CAN_SELL", "CAN_RECEIVE", "CAN_COLLECT", "CAN_COUNT"] : []);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          businessName: user.businessName,
          businessOwnerId: user.businessOwnerId,
          isPlatformAdmin: !!user.isPlatformAdmin,
          delegatedCapabilities,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: true, data: { user: null } });
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
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: "Failed to log out." },
      { status: 500 }
    );
  }
}
