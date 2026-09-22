import { NextRequest, NextResponse } from "next/server";
import { createUser, createSession, SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "@/server/authService";
import { seedBuildingMaterialDemoData } from "@/server/stockService";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, fullName, businessName } = body;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    if (!fullName || !fullName.trim()) {
      return NextResponse.json(
        { success: false, error: "Please enter your name." },
        { status: 400 }
      );
    }

    const user = await createUser({
      email,
      password,
      fullName,
      businessName: businessName || "My Building Materials Shop",
    });

    // Automatically seed sample store stock for their new account so they can immediately see value
    await seedBuildingMaterialDemoData(user.id);

    // Create session
    const session = await createSession(user.id);

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
      },
      message: "Account created successfully! Welcome to SISPA 1.0.",
    });

    // Set cookie
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
    console.error("Signup error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create account. Please try again." },
      { status: 400 }
    );
  }
}
