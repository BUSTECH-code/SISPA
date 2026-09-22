import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession } from "@/server/authService";

export async function POST(request: Request) {
  try {
    const { role } = await request.json();

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

    await createSession(user.id);

    return NextResponse.json({
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
  } catch (error) {
    console.error("[DemoLogin] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to log in to demo account." },
      { status: 500 }
    );
  }
}
