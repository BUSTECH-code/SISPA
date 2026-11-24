import { exportBusinessData } from "@/server/stockService";
import { requireRouteBusinessContext } from "@/server/authService";
import { assertCan } from "@/server/authorization";
import { recordSecurityAudit } from "@/server/auditService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { businessId, actorId, actorName, userRole, authContext } = await requireRouteBusinessContext(request);
    assertCan(authContext, "EXPORT_DATA", { businessId });

    const payload = await exportBusinessData(businessId, actorId, userRole);

    await recordSecurityAudit({
      businessId,
      actorId,
      actorName,
      actorRole: userRole,
      eventType: "BUSINESS_DATA_EXPORTED",
      description: `Shop owner exported full business backup archive (${payload.products.length} products, ${payload.sales.length} sales)`,
      entityType: "businesses",
      entityId: businessId,
      source: "WEB",
    });

    const safeBizName = (authContext.business.name || "Business").replace(/\s+/g, "_");
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="SISPA_Export_${safeBizName}_${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't export your business records.");
  }
}
