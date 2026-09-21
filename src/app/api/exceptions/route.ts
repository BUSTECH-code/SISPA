import { NextResponse } from "next/server";
import { getBusinessExceptions } from "@/server/stockService";
import { requireAuth, resolveBusinessContext } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    const { businessId, userRole } = resolveBusinessContext(user);

    const exceptions = await getBusinessExceptions(businessId, userRole);

    return NextResponse.json({
      success: true,
      data: exceptions,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to load business exceptions:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't check business exceptions." },
      { status: 500 }
    );
  }
}
