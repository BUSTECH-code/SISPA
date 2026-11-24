import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  verifyPassword,
  createSession,
  listUserActiveBusinesses,
  parsePositiveBusinessId,
  requireActiveBusinessContext,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
} from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, activeBusinessId, businessId } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Please enter both email and password." },
        { status: 400 }
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { success: false, code: "USER_SUSPENDED", error: "Your account is currently inactive." },
        { status: 403 }
      );
    }

    const requestedBusinessId = parsePositiveBusinessId(activeBusinessId ?? businessId);
    if (requestedBusinessId) {
      await requireActiveBusinessContext({
        userId: user.id,
        activeBusinessId: requestedBusinessId,
      });
    }

    const availableBusinesses = await listUserActiveBusinesses(user.id);
    const session = await createSession(user.id, requestedBusinessId);

    const response = NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        businessName: user.businessName,
        businessOwnerId: user.businessOwnerId,
        isPlatformAdmin: Boolean(user.isPlatformAdmin),
        activeBusinessId: session.activeBusinessId ?? null,
        availableBusinesses,
      },
      message: "Logged in successfully!",
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: session.id,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION_MS / 1000,
      path: "/",
    });

    return response;
  } catch (error: any) {
    return handleRouteError(error, "Failed to log in. Please try again.");
  }
}
