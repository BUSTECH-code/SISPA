import { NextResponse } from "next/server";
import { seedBuildingMaterialDemoData } from "@/server/stockService";
import { requireRouteBusinessContext } from "@/server/authService";
import { assertCan } from "@/server/authorization";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { businessId, actorId, authContext } = await requireRouteBusinessContext(request);
    assertCan(authContext, "BUSINESS_SETTINGS", { businessId });
    await seedBuildingMaterialDemoData(businessId, actorId);

    return NextResponse.json({
      success: true,
      message: "Sample building-material stock and sales history loaded successfully!",
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to initialize sample data. Please try again.");
  }
}
