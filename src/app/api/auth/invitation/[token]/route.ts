import { NextRequest, NextResponse } from "next/server";
import { validateInvitationToken, acceptStaffInvitation } from "@/server/authService";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "@/server/authService";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/invitation/[token] - Check validity of invitation link
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const validation = await validateInvitationToken(token);

    if (!validation.isValid || !validation.invitation || !validation.business) {
      return NextResponse.json(
        { success: false, error: validation.error || "Invalid invitation link." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        businessName: validation.business.name,
        inviteeName: validation.invitation.inviteeName,
        inviteeEmail: validation.invitation.inviteeEmail,
        role: validation.invitation.role,
        expiresAt: validation.invitation.expiresAt,
      },
    });
  } catch (error: any) {
    console.error("Error validating invitation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to validate invitation." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/invitation/[token] - Accept invitation and activate account
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { password, fullName, email } = body;

    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: "Please enter a secure password with at least 6 characters." },
        { status: 400 }
      );
    }

    if (!fullName || !fullName.trim()) {
      return NextResponse.json(
        { success: false, error: "Please provide your full name." },
        { status: 400 }
      );
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Please provide your email address." },
        { status: 400 }
      );
    }

    const { user, session } = await acceptStaffInvitation({
      token,
      password,
      fullName: fullName.trim(),
      email: email.trim(),
    });

    // Set auth cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION_MS / 1000,
      path: "/",
    });

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        businessName: user.businessName,
      },
      message: `Welcome to ${user.businessName}! Your staff account is active.`,
    });
  } catch (error: any) {
    console.error("Error accepting invitation:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to accept invitation." },
      { status: 400 }
    );
  }
}
