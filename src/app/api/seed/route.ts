import { NextResponse } from "next/server";
import { seedBuildingMaterialDemoData } from "@/server/stockService";
import { requireAuth } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireAuth();
    await seedBuildingMaterialDemoData(user.id);
    return NextResponse.json({
      success: true,
      message: "Sample building-material stock and sales history loaded successfully!",
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to seed sample stock:", error);
    return NextResponse.json(
      { success: false, error: "Failed to initialize sample data. Please try again." },
      { status: 500 }
    );
  }
}
