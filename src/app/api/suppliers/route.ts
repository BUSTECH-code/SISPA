import { NextResponse } from "next/server";
import { getSuppliersDirectory } from "@/server/stockService";
import { requireAuth, resolveBusinessContext } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    const { businessId, userRole } = resolveBusinessContext(user);

    const suppliersList = await getSuppliersDirectory(businessId, userRole);

    return NextResponse.json({
      success: true,
      data: suppliersList,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to load suppliers:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't load supplier history." },
      { status: 500 }
    );
  }
}
