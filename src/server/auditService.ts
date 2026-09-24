/**
 * SISPA 1.0 — Audit & Activity Architecture
 * 
 * Separates:
 * 1. Business Activity: Operational stream ("What happened in the business?")
 * 2. Security Audit Log: Compliance & governance ("Who changed something important?")
 */

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import type { AuthContext } from "./authorization";

export type AuditSource = "WEB" | "WHATSAPP" | "SYSTEM" | "SUPPORT";

export type SecurityEventType =
  | "STAFF_INVITED"
  | "STAFF_INVITATION_ACCEPTED"
  | "STAFF_INVITATION_REVOKED"
  | "STAFF_ACTIVATED"
  | "STAFF_SUSPENDED"
  | "STAFF_DEACTIVATED"
  | "PERMISSIONS_CHANGED"
  | "STAFF_CAPABILITIES_UPDATED"
  | "PURCHASE_COST_ENTERED"
  | "PURCHASE_COST_UPDATED"
  | "SELLING_PRICE_CHANGED"
  | "SALE_CORRECTED"
  | "PAYMENT_REVERSED"
  | "STOCK_ADJUSTMENT"
  | "BUSINESS_OWNERSHIP_TRANSFERRED"
  | "BUSINESS_STATUS_CHANGED"
  | "SUBSCRIPTION_PLAN_CHANGED"
  | "SUBSCRIPTION_STATUS_CHANGED"
  | "BUSINESS_DATA_EXPORTED"
  | "PLATFORM_SUPPORT_ACCESSED"
  | "SUPPORT_ACCESS_GRANTED"
  | "SUPPORT_REQUEST_SUBMITTED"
  | "SUPPORT_REQUEST_APPROVED"
  | "SUPPORT_REQUEST_REJECTED"
  | "SUPPORT_ACCESS_REVOKED"
  | "PLATFORM_SETTINGS_CHANGED"
  | "USER_LOGIN_FAILED"
  | "USER_PASSWORD_CHANGED";

export type BusinessActivityType =
  | "SALE"
  | "PAYMENT"
  | "DELIVERY"
  | "STOCK_COUNT"
  | "EXPENSE";

export interface RecordSecurityAuditParams {
  businessId: number;
  actorId: number;
  actorName: string;
  actorRole: "OWNER" | "STAFF" | "PLATFORM_ADMIN";
  eventType: SecurityEventType;
  description: string;
  entityType: string;
  entityId?: number;
  beforeState?: Record<string, any> | string | null;
  afterState?: Record<string, any> | string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  source?: AuditSource;
  isSensitive?: boolean;
}

/**
 * Record an authoritative security/governance audit log entry.
 * Append-only. Captures WHO, WHAT, BUSINESS, OBJECT, WHEN, SOURCE, BEFORE, AFTER, REASON.
 */
export async function recordSecurityAudit(params: RecordSecurityAuditParams): Promise<void> {
  try {
    const beforeStr =
      params.beforeState && typeof params.beforeState === "object"
        ? JSON.stringify(params.beforeState)
        : params.beforeState ? String(params.beforeState) : null;

    const afterStr =
      params.afterState && typeof params.afterState === "object"
        ? JSON.stringify(params.afterState)
        : params.afterState ? String(params.afterState) : null;

    await db.insert(auditLogs).values({
      userId: params.businessId, // For backwards compatibility
      businessId: params.businessId,
      actorId: params.actorId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      eventType: params.eventType,
      description: params.description,
      entityType: params.entityType,
      entityId: params.entityId || null,
      oldValue: params.oldValue || null,
      newValue: params.newValue || null,
      beforeState: beforeStr,
      afterState: afterStr,
      reason: params.reason || null,
      source: params.source || "WEB",
      isSensitive: params.isSensitive ?? false,
    });
  } catch (error) {
    console.error("[SISPA Audit] Failed to record security audit log:", error);
    // Audit write failures shouldn't silently swallow if security critical, but handle gracefully
  }
}

/**
 * Query the security audit trail for a business (Protected, Owner only)
 */
export async function getSecurityAuditLogs(params: {
  businessId: number;
  includeSensitive: boolean;
  limit?: number;
}) {
  const { businessId, includeSensitive, limit = 100 } = params;

  try {
    const records = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, businessId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    if (includeSensitive) {
      return records;
    }

    // Filter out sensitive logs if not authorized
    return records.filter((r) => !r.isSensitive);
  } catch (error) {
    console.error("[SISPA Audit] Error fetching audit logs:", error);
    return [];
  }
}
