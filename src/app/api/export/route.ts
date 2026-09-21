import { NextResponse } from "next/server";
import { exportBusinessData } from "@/server/stockService";
import { requireOwner, resolveBusinessContext } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireOwner();
    const { businessId } = resolveBusinessContext(user);

    const payload = await exportBusinessData(businessId);

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="SISPA_Export_${user.businessName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    if (error.message === "FORBIDDEN_OWNER_ONLY") {
      return NextResponse.json({ success: false, error: "Only the shop owner can export business records." }, { status: 403 });
    }
    console.error("Failed to export business data:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't export your business records." },
      { status: 500 }
    );
  }
}
