import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, getCurrentUser, SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "@/server/authService";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { role } = await request.json();

    // Prevent privilege escalation: An active STAFF session cannot escalate to OWNER or PLATFORM_ADMIN
    const currentUser = await getCurrentUser();
    if (currentUser && currentUser.role === "STAFF" && (role === "OWNER" || role === "PLATFORM_ADMIN")) {
      return NextResponse.json(
        {
          success: false,
          error: "Privilege escalation blocked. Staff identities cannot switch to Owner or Admin. Sign out first.",
        },
        { status: 403 }
      );
    }

    let targetEmail = "owner@buildingmaterials.com";
    if (role === "STAFF") {
      targetEmail = "staff@buildingmaterials.com";
    } else if (role === "PLATFORM_ADMIN") {
      targetEmail = "admin@sispa.io";
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, targetEmail))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { success: false, error: `Demo account for ${role} (${targetEmail}) was not found.` },
        { status: 404 }
      );
    }

    const session = await createSession(user.id);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        businessName: user.businessName,
        isPlatformAdmin: Boolean(user.isPlatformAdmin),
      },
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
  } catch (error) {
    console.error("[DemoLogin] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to log in to demo account." },
      { status: 500 }
    );
  }
}
