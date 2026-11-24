import { db } from "@/db";
import {
  users,
  sessions,
  businesses,
  businessMemberships,
  staffInvitations,
  businessSubscriptions,
  supportAccessLogs,
  platformSettings,
  products,
  stockLedgerEntries,
  customers,
  auditLogs,
  type User,
  type Session,
  type Business,
  type BusinessMembership,
  type StaffInvitation,
} from "@/db/schema";
import { eq, and, desc, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import {
  type AuthContext,
  type Capability,
  type MembershipRole,
  type MembershipStatus,
  can,
  assertCan,
} from "./authorization";
import { recordSecurityAudit } from "./auditService";

const SESSION_COOKIE_NAME = "sispa_session_id";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const INVITATION_EXPIRY_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export class ActiveBusinessRequiredError extends Error {
  readonly statusCode = 400;
  readonly code = "ACTIVE_BUSINESS_REQUIRED";

  constructor(message = "Explicit activeBusinessId is required for business-scoped operations.") {
    super(message);
    this.name = "ActiveBusinessRequiredError";
  }
}

export function parsePositiveBusinessId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

/**
 * Hash password securely
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Strict explicit business context resolver (zero fallback to userId or businesses[0]).
 */
export function resolveBusinessContext(user: User, activeBusinessId?: number | null): {
  businessId: number;
  userRole: "OWNER" | "STAFF";
  actorId: number;
  actorName: string;
} {
  const parsed = parsePositiveBusinessId(activeBusinessId);
  if (!parsed) {
    throw new ActiveBusinessRequiredError();
  }
  const userRole = (user.role as "OWNER" | "STAFF") || "OWNER";
  return {
    businessId: parsed,
    userRole,
    actorId: user.id,
    actorName: user.fullName,
  };
}

/**
 * Get or automatically ensure a commercial business entity exists for an owner
 */
export async function ensureBusinessForOwner(ownerUser: User): Promise<Business> {
  const existing = await db
    .select()
    .from(businesses)
    .where(eq(businesses.ownerUserId, ownerUser.id))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Create business entity
  const trialEndsAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14); // 14-day trial
  const [newBiz] = await db
    .insert(businesses)
    .values({
      name: ownerUser.businessName || "My Building Materials Shop",
      currency: "NGN",
      state: "ACTIVE",
      ownerUserId: ownerUser.id,
      subscriptionPlan: "STANDARD",
      subscriptionStatus: "TRIAL",
      trialEndsAt,
    })
    .returning();

  // Create owner membership
  await db.insert(businessMemberships).values({
    businessId: newBiz.id,
    userId: ownerUser.id,
    role: "OWNER",
    status: "ACTIVE",
    activatedAt: new Date(),
  });

  // Create subscription record
  await db.insert(businessSubscriptions).values({
    businessId: newBiz.id,
    plan: "STANDARD",
    status: "TRIAL",
    provider: "DIRECT",
    trialEndsAt,
  });

  return newBiz;
}

/**
 * Create a new user and ensure proper business and membership creation
 */
export async function createUser(params: {
  email: string;
  password: string;
  fullName: string;
  businessName?: string;
  role?: "OWNER" | "STAFF";
  businessOwnerId?: number | null;
  phone?: string;
  isPlatformAdmin?: boolean;
}): Promise<User> {
  const {
    email,
    password,
    fullName,
    businessName = "My Building Materials Shop",
    role = "OWNER",
    businessOwnerId = null,
    phone,
    isPlatformAdmin = false,
  } = params;

  // Check existing user
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (existing.length > 0) {
    throw new Error("An account with this email address already exists.");
  }

  const passwordHash = await hashPassword(password);

  const [newUser] = await db
    .insert(users)
    .values({
      email: email.toLowerCase().trim(),
      passwordHash,
      fullName: fullName.trim(),
      phone: phone?.trim() || null,
      role,
      businessName: businessName.trim(),
      businessOwnerId,
      isActive: true,
      isPlatformAdmin: !!isPlatformAdmin,
    })
    .returning();

  // If role is OWNER, provision commercial tenant & owner membership
  if (role === "OWNER") {
    await ensureBusinessForOwner(newUser);
  } else if (businessOwnerId) {
    // If staff with businessOwnerId, associate membership with the owner's business
    try {
      const bizList = await db
        .select()
        .from(businesses)
        .where(eq(businesses.ownerUserId, businessOwnerId))
        .limit(1);

      if (bizList.length > 0) {
        await db.insert(businessMemberships).values({
          businessId: bizList[0].id,
          userId: newUser.id,
          role: "STAFF",
          status: "ACTIVE",
          activatedAt: new Date(),
        });
      }
    } catch (err) {
      console.warn("[SISPA Auth] Non-fatal membership link error:", err);
    }
  }

  return newUser;
}

/**
 * Owner creates a staff member (legacy helper, links membership)
 */
export async function createStaffMember(params: {
  ownerUser: User;
  email: string;
  password: string;
  fullName: string;
}): Promise<User> {
  const { ownerUser, email, password, fullName } = params;

  if (ownerUser.role !== "OWNER") {
    throw new Error("Only the shop owner can add staff members.");
  }

  return createUser({
    email,
    password,
    fullName,
    businessName: ownerUser.businessName,
    role: "STAFF",
    businessOwnerId: ownerUser.id,
  });
}

// ============================================================================
// OWNER-CONTROLLED STAFF INVITATIONS (Section 4)
// ============================================================================

export interface StaffInvitationResponse {
  id: number;
  token: string;
  inviteUrl: string;
  inviteeName: string;
  inviteeEmail: string | null;
  role: string;
  status: string;
  customCapabilities: string[];
  expiresAt: Date;
  businessName: string;
}

/**
 * Generate a secure, single-use, short-lived staff invitation
 */
export async function createStaffInvitation(params: {
  ownerUser: User;
  businessId: number;
  inviteeName: string;
  inviteeEmail?: string;
  role?: "STAFF";
  customCapabilities?: string[];
  origin?: string;
}): Promise<StaffInvitationResponse> {
  const {
    ownerUser,
    businessId,
    inviteeName,
    inviteeEmail,
    role = "STAFF",
    customCapabilities = ["CAN_SELL", "CAN_RECEIVE", "CAN_COLLECT", "CAN_COUNT"],
    origin = "",
  } = params;

  const ctx = await requireActiveBusinessContext({
    userId: ownerUser.id,
    activeBusinessId: businessId,
  });
  assertCan(ctx, "STAFF_MANAGE", { businessId });

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);

  const [invitation] = await db
    .insert(staffInvitations)
    .values({
      businessId: ctx.business.id,
      token,
      inviteeEmail: inviteeEmail?.toLowerCase().trim() || null,
      inviteeName: inviteeName.trim(),
      role,
      invitedByUserId: ownerUser.id,
      customCapabilities: JSON.stringify(customCapabilities),
      status: "PENDING",
      expiresAt,
    })
    .returning();

  // Audit invitation generation
  await recordSecurityAudit({
    businessId: ctx.business.id,
    actorId: ownerUser.id,
    actorName: ownerUser.fullName,
    actorRole: "OWNER",
    eventType: "STAFF_INVITED",
    description: `Generated staff invitation for ${inviteeName}${inviteeEmail ? ` (${inviteeEmail})` : ""} with capabilities: [${customCapabilities.join(", ")}]`,
    entityType: "staff_invitations",
    entityId: invitation.id,
    afterState: { inviteeName, inviteeEmail, customCapabilities, expiresAt },
  });

  const baseUrl = origin || (process.env.NEXT_PUBLIC_APP_URL || "");
  const inviteUrl = `${baseUrl}/invite/${token}`;

  return {
    id: invitation.id,
    token: invitation.token,
    inviteUrl,
    inviteeName: invitation.inviteeName || inviteeName,
    inviteeEmail: invitation.inviteeEmail,
    role: invitation.role,
    status: invitation.status,
    customCapabilities,
    expiresAt: invitation.expiresAt,
    businessName: ctx.business.name,
  };
}

/**
 * List pending and past staff invitations for a business
 */
export async function getStaffInvitations(businessId: number): Promise<StaffInvitation[]> {
  if (!parsePositiveBusinessId(businessId)) {
    throw new ActiveBusinessRequiredError();
  }
  return db
    .select()
    .from(staffInvitations)
    .where(eq(staffInvitations.businessId, businessId))
    .orderBy(desc(staffInvitations.createdAt));
}

/**
 * Revoke a pending staff invitation
 */
export async function revokeStaffInvitation(params: {
  ownerUser: User;
  businessId: number;
  invitationId: number;
}): Promise<boolean> {
  const { ownerUser, businessId, invitationId } = params;
  const ctx = await requireActiveBusinessContext({
    userId: ownerUser.id,
    activeBusinessId: businessId,
  });
  assertCan(ctx, "STAFF_MANAGE", { businessId });

  const [existing] = await db
    .select()
    .from(staffInvitations)
    .where(and(eq(staffInvitations.id, invitationId), eq(staffInvitations.businessId, ctx.business.id)))
    .limit(1);

  if (!existing || existing.status !== "PENDING") {
    return false;
  }

  await db
    .update(staffInvitations)
    .set({ status: "REVOKED" })
    .where(eq(staffInvitations.id, invitationId));

  await recordSecurityAudit({
    businessId: ctx.business.id,
    actorId: ownerUser.id,
    actorName: ownerUser.fullName,
    actorRole: "OWNER",
    eventType: "STAFF_INVITATION_REVOKED",
    description: `Revoked staff invitation #${invitationId} for ${existing.inviteeName}`,
    entityType: "staff_invitations",
    entityId: invitationId,
  });

  return true;
}

/**
 * Validate an invitation token
 */
export async function validateInvitationToken(token: string): Promise<{
  isValid: boolean;
  invitation?: StaffInvitation;
  business?: Business;
  error?: string;
}> {
  if (!token || typeof token !== "string" || token.length < 10) {
    return { isValid: false, error: "Invalid invitation link." };
  }

  const [invitation] = await db
    .select()
    .from(staffInvitations)
    .where(eq(staffInvitations.token, token))
    .limit(1);

  if (!invitation) {
    return { isValid: false, error: "Invitation not found." };
  }

  if (invitation.status === "ACCEPTED") {
    return { isValid: false, error: "This invitation has already been used." };
  }

  if (invitation.status === "REVOKED") {
    return { isValid: false, error: "This invitation was revoked by the shop owner." };
  }

  if (new Date() > new Date(invitation.expiresAt)) {
    return { isValid: false, error: "This invitation link has expired. Please ask the shop owner for a new one." };
  }

  const [biz] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, invitation.businessId))
    .limit(1);

  return {
    isValid: true,
    invitation,
    business: biz,
  };
}

/**
 * Accept a staff invitation: create staff user with their chosen password, establish membership
 */
export async function acceptStaffInvitation(params: {
  token: string;
  password: string;
  fullName: string;
  email: string;
}): Promise<{ user: User; session: Session }> {
  const { token, password, fullName, email } = params;

  const validation = await validateInvitationToken(token);
  if (!validation.isValid || !validation.invitation || !validation.business) {
    throw new Error(validation.error || "Invalid invitation token.");
  }

  const { invitation, business } = validation;

  // Create user
  const newUser = await createUser({
    email,
    password,
    fullName,
    businessName: business.name,
    role: "STAFF",
    businessOwnerId: business.ownerUserId,
  });

  // Ensure membership is created and set to ACTIVE with delegated capabilities
  const delegatedCapabilities = invitation.customCapabilities || JSON.stringify(["CAN_SELL", "CAN_RECEIVE", "CAN_COLLECT", "CAN_COUNT"]);

  await db
    .insert(businessMemberships)
    .values({
      businessId: business.id,
      userId: newUser.id,
      role: "STAFF",
      status: "ACTIVE",
      customCapabilities: delegatedCapabilities,
      activatedAt: new Date(),
      invitedByUserId: invitation.invitedByUserId,
      invitedAt: invitation.createdAt,
    })
    .onConflictDoUpdate({
      target: [businessMemberships.businessId, businessMemberships.userId],
      set: {
        status: "ACTIVE",
        customCapabilities: delegatedCapabilities,
        activatedAt: new Date(),
      },
    });

  // Mark invitation accepted
  await db
    .update(staffInvitations)
    .set({
      status: "ACCEPTED",
      acceptedAt: new Date(),
      acceptedByUserId: newUser.id,
    })
    .where(eq(staffInvitations.id, invitation.id));

  // Audit event
  await recordSecurityAudit({
    businessId: business.id,
    actorId: newUser.id,
    actorName: newUser.fullName,
    actorRole: "STAFF",
    eventType: "STAFF_INVITATION_ACCEPTED",
    description: `Staff member ${newUser.fullName} accepted invitation and activated account`,
    entityType: "users",
    entityId: newUser.id,
    afterState: { email: newUser.email, fullName: newUser.fullName, role: "STAFF", status: "ACTIVE" },
  });

  const session = await createSession(newUser.id, business.id);
  return { user: newUser, session };
}

// ============================================================================
// STAFF LIFECYCLE MANAGEMENT (Section 5)
// ============================================================================

export interface StaffMemberDetail {
  id: number;
  userId: number;
  fullName: string;
  email: string;
  role: MembershipRole;
  status: MembershipStatus;
  customCapabilities: string[];
  invitedAt: Date | null;
  activatedAt: Date | null;
  suspendedAt: Date | null;
  deactivatedAt: Date | null;
  createdAt: Date;
}

/**
 * List staff members with comprehensive lifecycle status and delegated capabilities for an explicit businessId
 */
export async function getStaffMembersWithLifecycle(businessId: number): Promise<StaffMemberDetail[]> {
  if (!parsePositiveBusinessId(businessId)) {
    throw new ActiveBusinessRequiredError();
  }

  const list = await db
    .select({
      membershipId: businessMemberships.id,
      userId: users.id,
      fullName: users.fullName,
      email: users.email,
      role: businessMemberships.role,
      status: businessMemberships.status,
      customCapabilities: businessMemberships.customCapabilities,
      invitedAt: businessMemberships.invitedAt,
      activatedAt: businessMemberships.activatedAt,
      suspendedAt: businessMemberships.suspendedAt,
      deactivatedAt: businessMemberships.deactivatedAt,
      createdAt: users.createdAt,
    })
    .from(businessMemberships)
    .innerJoin(users, eq(businessMemberships.userId, users.id))
    .where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.role, "STAFF")))
    .orderBy(desc(users.createdAt));

  return list.map((item) => {
    let parsedCaps: string[] = ["CAN_SELL", "CAN_RECEIVE", "CAN_COLLECT", "CAN_COUNT"];
    if (item.customCapabilities) {
      try {
        parsedCaps = JSON.parse(item.customCapabilities);
      } catch {
        // fallback to defaults
      }
    }
    return {
      id: item.membershipId,
      userId: item.userId,
      fullName: item.fullName,
      email: item.email,
      role: item.role as MembershipRole,
      status: item.status as MembershipStatus,
      customCapabilities: parsedCaps,
      invitedAt: item.invitedAt,
      activatedAt: item.activatedAt,
      suspendedAt: item.suspendedAt,
      deactivatedAt: item.deactivatedAt,
      createdAt: item.createdAt,
    };
  });
}

/**
 * Update staff membership lifecycle status (ACTIVE, SUSPENDED, DEACTIVATED).
 * When SUSPENDED or DEACTIVATED, immediately invalidates all active sessions.
 */
export async function updateStaffMembershipStatus(params: {
  ownerUser: User;
  businessId: number;
  staffUserId: number;
  newStatus: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  reason?: string;
}): Promise<boolean> {
  const { ownerUser, businessId, staffUserId, newStatus, reason } = params;

  const ctx = await requireActiveBusinessContext({
    userId: ownerUser.id,
    activeBusinessId: businessId,
  });
  assertCan(ctx, "STAFF_MANAGE", { businessId });

  if (ownerUser.id === staffUserId) {
    throw new Error("CANNOT_MODIFY_OWN_MEMBERSHIP");
  }

  const [membership] = await db
    .select()
    .from(businessMemberships)
    .where(and(eq(businessMemberships.businessId, ctx.business.id), eq(businessMemberships.userId, staffUserId)))
    .limit(1);

  if (!membership) {
    throw new Error("STAFF_MEMBERSHIP_NOT_FOUND");
  }

  const [staffUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, staffUserId))
    .limit(1);

  if (!staffUser) {
    throw new Error("Staff user not found.");
  }

  const previousStatus = membership.status;
  const now = new Date();

  // Update membership
  await db
    .update(businessMemberships)
    .set({
      status: newStatus,
      suspendedAt: newStatus === "SUSPENDED" ? now : null,
      deactivatedAt: newStatus === "DEACTIVATED" ? now : null,
      activatedAt: newStatus === "ACTIVE" ? now : membership.activatedAt || now,
      updatedAt: now,
    })
    .where(eq(businessMemberships.id, membership.id));

  // If suspended or deactivated, revoke all active sessions for that user on this business immediately
  if (newStatus === "SUSPENDED" || newStatus === "DEACTIVATED") {
    await db.delete(sessions).where(eq(sessions.userId, staffUserId));
  }

  // Audit event
  const eventType =
    newStatus === "SUSPENDED"
      ? "STAFF_SUSPENDED"
      : newStatus === "DEACTIVATED"
      ? "STAFF_DEACTIVATED"
      : "STAFF_ACTIVATED";

  await recordSecurityAudit({
    businessId: ctx.business.id,
    actorId: ownerUser.id,
    actorName: ownerUser.fullName,
    actorRole: "OWNER",
    eventType,
    description: `Staff member ${staffUser.fullName} (${staffUser.email}) changed status to ${newStatus}${reason ? `: ${reason}` : ""}`,
    entityType: "users",
    entityId: staffUserId,
    oldValue: previousStatus,
    newValue: newStatus,
    reason: reason || null,
  });

  return true;
}

/**
 * Owner updates delegated operational capabilities for a staff member
 */
export async function updateStaffCapabilities(params: {
  ownerUser: User;
  businessId: number;
  staffUserId: number;
  capabilities: string[];
}): Promise<boolean> {
  const { ownerUser, businessId, staffUserId, capabilities } = params;

  const ctx = await requireActiveBusinessContext({
    userId: ownerUser.id,
    activeBusinessId: businessId,
  });
  assertCan(ctx, "STAFF_MANAGE", { businessId });

  const [membership] = await db
    .select()
    .from(businessMemberships)
    .where(and(eq(businessMemberships.businessId, ctx.business.id), eq(businessMemberships.userId, staffUserId)))
    .limit(1);

  if (!membership) {
    throw new Error("Staff membership record not found.");
  }

  let oldCapabilities: string[] = [];
  try {
    oldCapabilities = membership.customCapabilities ? JSON.parse(membership.customCapabilities) : [];
  } catch {
    oldCapabilities = [];
  }

  await db
    .update(businessMemberships)
    .set({
      customCapabilities: JSON.stringify(capabilities),
      updatedAt: new Date(),
    })
    .where(eq(businessMemberships.id, membership.id));

  await recordSecurityAudit({
    businessId: ctx.business.id,
    actorId: ownerUser.id,
    actorName: ownerUser.fullName,
    actorRole: "OWNER",
    eventType: "STAFF_CAPABILITIES_UPDATED",
    description: `Owner ${ownerUser.fullName} updated delegated capabilities for staff member #${staffUserId}: [${capabilities.join(", ")}]`,
    entityType: "business_memberships",
    entityId: membership.id,
    oldValue: JSON.stringify(oldCapabilities),
    newValue: JSON.stringify(capabilities),
  });

  return true;
}

// ============================================================================
// PROTECTED OWNERSHIP TRANSFER (Section 16)
// ============================================================================

export async function transferBusinessOwnership(params: {
  currentOwner: User;
  businessId: number;
  newOwnerUserId: number;
  passwordConfirmation: string;
  reason?: string;
}): Promise<boolean> {
  const { currentOwner, businessId, newOwnerUserId, passwordConfirmation, reason } = params;

  const ctx = await requireActiveBusinessContext({
    userId: currentOwner.id,
    activeBusinessId: businessId,
  });
  assertCan(ctx, "OWNERSHIP_TRANSFER", { businessId });

  // Re-authentication check
  const isPasswordValid = await verifyPassword(passwordConfirmation, currentOwner.passwordHash);
  if (!isPasswordValid) {
    throw new Error("INVALID_CREDENTIALS");
  }

  // Validate eligible candidate (must be active user and active member of THIS business)
  const [newOwnerUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, newOwnerUserId))
    .limit(1);

  if (!newOwnerUser || !newOwnerUser.isActive) {
    throw new Error("NEW_OWNER_NOT_ACTIVE");
  }

  const [candidateMembership] = await db
    .select()
    .from(businessMemberships)
    .where(
      and(
        eq(businessMemberships.businessId, ctx.business.id),
        eq(businessMemberships.userId, newOwnerUserId),
        eq(businessMemberships.status, "ACTIVE")
      )
    )
    .limit(1);

  if (!candidateMembership) {
    throw new Error("NEW_OWNER_NOT_ACTIVE_MEMBER");
  }

  // Update business owner
  await db
    .update(businesses)
    .set({ ownerUserId: newOwnerUserId, updatedAt: new Date() })
    .where(eq(businesses.id, ctx.business.id));

  // Update membership for new owner
  await db
    .update(businessMemberships)
    .set({ role: "OWNER", updatedAt: new Date() })
    .where(and(eq(businessMemberships.businessId, ctx.business.id), eq(businessMemberships.userId, newOwnerUserId)));

  // Demote previous owner to STAFF
  await db
    .update(businessMemberships)
    .set({ role: "STAFF", updatedAt: new Date() })
    .where(and(eq(businessMemberships.businessId, ctx.business.id), eq(businessMemberships.userId, currentOwner.id)));

  // Audit event
  await recordSecurityAudit({
    businessId: ctx.business.id,
    actorId: currentOwner.id,
    actorName: currentOwner.fullName,
    actorRole: "OWNER",
    eventType: "BUSINESS_OWNERSHIP_TRANSFERRED",
    description: `Transferred business ownership of "${ctx.business.name}" from ${currentOwner.fullName} to ${newOwnerUser.fullName}`,
    entityType: "businesses",
    entityId: ctx.business.id,
    beforeState: { ownerUserId: currentOwner.id, ownerName: currentOwner.fullName },
    afterState: { ownerUserId: newOwnerUserId, ownerName: newOwnerUser.fullName },
    reason: reason || "Owner initiated ownership transfer",
  });

  return true;
}

// ============================================================================
// SESSIONS & EXPLICIT ACTIVE-BUSINESS USER CONTEXT
// ============================================================================

/**
 * List staff members belonging to a shop owner (legacy helper)
 */
export async function getStaffMembers(ownerId: number): Promise<Array<Omit<User, "passwordHash">>> {
  const list = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      businessName: users.businessName,
      businessOwnerId: users.businessOwnerId,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(and(eq(users.businessOwnerId, ownerId), eq(users.role, "STAFF")));

  return list as Array<Omit<User, "passwordHash">>;
}

/**
 * Create a new session for user (with optional explicit activeBusinessId — never inferred)
 */
export async function createSession(
  userId: number,
  activeBusinessId?: number | null
): Promise<Session> {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const [session] = await db
    .insert(sessions)
    .values({
      id: sessionId,
      userId,
      activeBusinessId: parsePositiveBusinessId(activeBusinessId),
      expiresAt,
    })
    .returning();

  return session;
}

/**
 * Get authenticated user + session from session cookie
 */
export async function getCurrentSession(): Promise<{ user: User; session: Session } | null> {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionId) {
      return null;
    }

    const now = new Date();

    const result = await db
      .select({
        user: users,
        session: sessions,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const { user, session } = result[0];

    if (new Date(session.expiresAt) < now || !user.isActive) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      return null;
    }

    return { user, session };
  } catch (err: any) {
    if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
      console.error("Error retrieving current session:", err);
    }
    return null;
  }
}

/**
 * Get authenticated user from session cookie
 */
export async function getCurrentUser(): Promise<User | null> {
  const current = await getCurrentSession();
  return current ? current.user : null;
}

/**
 * List all ACTIVE businesses where user holds an ACTIVE membership
 */
export async function listUserActiveBusinesses(userId: number): Promise<
  Array<{
    businessId: number;
    name: string;
    currency: string;
    state: string;
    role: MembershipRole;
    customCapabilities: Capability[];
  }>
> {
  const rows = await db
    .select({
      business: businesses,
      membership: businessMemberships,
    })
    .from(businessMemberships)
    .innerJoin(businesses, eq(businessMemberships.businessId, businesses.id))
    .where(
      and(
        eq(businessMemberships.userId, userId),
        eq(businessMemberships.status, "ACTIVE"),
        eq(businesses.state, "ACTIVE")
      )
    );

  return rows.map(({ business, membership }) => {
    let caps: Capability[] = [];
    if (membership.customCapabilities) {
      try {
        caps = JSON.parse(membership.customCapabilities);
      } catch {
        caps = [];
      }
    }
    return {
      businessId: business.id,
      name: business.name,
      currency: business.currency,
      state: business.state,
      role: membership.role as MembershipRole,
      customCapabilities: caps,
    };
  });
}

/**
 * Resolve & validate full AuthContext for an explicit activeBusinessId.
 * Rejects missing activeBusinessId with ActiveBusinessRequiredError (400),
 * even when the user belongs to exactly one business.
 */
export async function requireActiveBusinessContext(params: {
  userId: number;
  activeBusinessId?: number | null;
  sessionId?: string | null;
  explicitRole?: "OWNER" | "STAFF";
  allowInactiveForAssertion?: boolean;
}): Promise<AuthContext> {
  const { userId, sessionId, explicitRole, allowInactiveForAssertion = false } = params;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  let targetBusinessId = parsePositiveBusinessId(params.activeBusinessId);
  if (!targetBusinessId && sessionId) {
    const [sess] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .limit(1);
    if (sess) {
      targetBusinessId = parsePositiveBusinessId(sess.activeBusinessId);
    }
  }

  if (!targetBusinessId) {
    throw new ActiveBusinessRequiredError();
  }

  const [biz] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, targetBusinessId))
    .limit(1);

  if (!biz) {
    throw new Error("BUSINESS_NOT_FOUND");
  }

  const [membershipRecord] = await db
    .select()
    .from(businessMemberships)
    .where(
      and(
        eq(businessMemberships.businessId, targetBusinessId),
        eq(businessMemberships.userId, user.id)
      )
    )
    .limit(1);

  let activeSupportGrant: AuthContext["activeSupportGrant"] | undefined;
  if (!membershipRecord) {
    if (user.isPlatformAdmin) {
      const now = new Date();
      const grants = await db
        .select()
        .from(supportAccessLogs)
        .where(
          and(
            eq(supportAccessLogs.businessId, targetBusinessId),
            eq(supportAccessLogs.platformAdminUserId, user.id),
            eq(supportAccessLogs.status, "APPROVED")
          )
        )
        .orderBy(desc(supportAccessLogs.approvedAt))
        .limit(5);
      const validGrant = grants.find((g) => !g.revokedAt && g.expiresAt && new Date(g.expiresAt) > now);
      if (validGrant && validGrant.expiresAt) {
        activeSupportGrant = {
          platformAdminUserId: user.id,
          reason: validGrant.reason,
          scope: validGrant.scope === "READ_ONLY" ? "READ_ONLY" : "FULL",
          expiresAt: validGrant.expiresAt,
        };
      }
    }
    if (!activeSupportGrant) {
      throw new Error("FORBIDDEN_CROSS_BUSINESS");
    }
  }

  if (!allowInactiveForAssertion && !activeSupportGrant) {
    if (biz.state !== "ACTIVE") {
      throw new Error(`BUSINESS_${biz.state}`);
    }
    if (!user.isActive || membershipRecord!.status === "SUSPENDED") {
      throw new Error("STAFF_SUSPENDED");
    }
    if (membershipRecord!.status === "DEACTIVATED") {
      throw new Error("STAFF_DEACTIVATED");
    }
    if (membershipRecord!.status !== "ACTIVE") {
      throw new Error("MEMBERSHIP_NOT_ACTIVE");
    }
  }

  let customCaps: Capability[] = [];
  if (membershipRecord?.customCapabilities) {
    try {
      customCaps = JSON.parse(membershipRecord.customCapabilities);
    } catch {
      customCaps = [];
    }
  }

  const resolvedRole = (
    explicitRole ||
    membershipRecord?.role ||
    (activeSupportGrant ? "OWNER" : user.role) ||
    "STAFF"
  ) as MembershipRole;

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    isPlatformAdmin: user.isPlatformAdmin,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
    },
    business: {
      id: biz.id,
      name: biz.name,
      currency: biz.currency,
      state: biz.state as any,
      ownerUserId: biz.ownerUserId || user.id,
      subscriptionPlan: biz.subscriptionPlan as any,
      subscriptionStatus: biz.subscriptionStatus as any,
      trialEndsAt: biz.trialEndsAt,
      currentPeriodEnd: biz.currentPeriodEnd,
    },
    membership: {
      id: membershipRecord?.id || user.id,
      role: resolvedRole,
      status: membershipRecord
        ? ((!user.isActive && membershipRecord.status === "ACTIVE") ? "SUSPENDED" : (membershipRecord.status as MembershipStatus))
        : "ACTIVE",
      customCapabilities: customCaps,
    },
    activeSupportGrant,
  };
}

/**
 * Bind an explicit activeBusinessId onto an authenticated session after validating membership & active state
 */
export async function setSessionActiveBusiness(params: {
  sessionId: string;
  userId: number;
  businessId: number;
}): Promise<AuthContext> {
  const { sessionId, userId, businessId } = params;
  const parsedBizId = parsePositiveBusinessId(businessId);
  if (!parsedBizId) {
    throw new ActiveBusinessRequiredError();
  }

  const ctx = await requireActiveBusinessContext({
    userId,
    activeBusinessId: parsedBizId,
  });

  await db
    .update(sessions)
    .set({ activeBusinessId: ctx.business.id })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));

  await recordSecurityAudit({
    businessId: ctx.business.id,
    actorId: userId,
    actorName: ctx.fullName,
    actorRole: ctx.membership.role,
    eventType: "ACTIVE_BUSINESS_SWITCHED",
    entityType: "sessions",
    description: `${ctx.fullName} selected active business "${ctx.business.name}" (#${ctx.business.id}).`,
  });

  return ctx;
}

/**
 * Extract explicit activeBusinessId from API request (header, query, body, or bound session.activeBusinessId)
 * and validate strict ACTIVE business + ACTIVE membership. Never infers from userId or businesses[0].
 */
export async function requireRouteBusinessContext(
  request?: Request | null,
  body?: Record<string, any> | null
): Promise<{
  user: User;
  session: Session;
  authContext: AuthContext;
  businessId: number;
  userRole: "OWNER" | "STAFF";
  actorId: number;
  actorName: string;
}> {
  const current = await getCurrentSession();
  if (!current) {
    throw new Error("UNAUTHORIZED");
  }

  const { user, session } = current;

  let headerBizId: number | null = null;
  let queryBizId: number | null = null;
  let bodyBizId: number | null = null;

  if (request) {
    headerBizId = parsePositiveBusinessId(request.headers.get("x-business-id"));
    try {
      const url = new URL(request.url);
      queryBizId = parsePositiveBusinessId(
        url.searchParams.get("activeBusinessId") ?? url.searchParams.get("businessId")
      );
    } catch {
      // ignore malformed URL
    }
  }

  if (body && typeof body === "object") {
    bodyBizId = parsePositiveBusinessId(body.activeBusinessId ?? body.businessId);
  }

  const explicitCandidates = [headerBizId, queryBizId, bodyBizId].filter(
    (v): v is number => v !== null
  );
  if (explicitCandidates.length > 1 && new Set(explicitCandidates).size > 1) {
    throw new ActiveBusinessRequiredError(
      "Conflicting activeBusinessId values provided across header, query, or request body."
    );
  }

  const explicitBusinessId = explicitCandidates[0] ?? parsePositiveBusinessId(session.activeBusinessId);
  if (!explicitBusinessId) {
    throw new ActiveBusinessRequiredError();
  }

  const authContext = await requireActiveBusinessContext({
    userId: user.id,
    activeBusinessId: explicitBusinessId,
  });

  return {
    user,
    session,
    authContext,
    businessId: authContext.business.id,
    userRole: authContext.membership.role,
    actorId: user.id,
    actorName: user.fullName,
  };
}

/**
 * Get full authoritative AuthContext for current session (requires session.activeBusinessId or explicit activeBusinessId)
 */
export async function getCurrentAuthContext(activeBusinessId?: number | null): Promise<AuthContext | null> {
  const current = await getCurrentSession();
  if (!current) return null;

  return requireActiveBusinessContext({
    userId: current.user.id,
    activeBusinessId: activeBusinessId ?? current.session.activeBusinessId,
    sessionId: current.session.id,
  });
}

/**
 * Resolve full authoritative AuthContext for a given userId and explicit activeBusinessId
 */
export async function getAuthContextForUser(
  userId: number,
  explicitRole?: "OWNER" | "STAFF",
  activeBusinessId?: number | null
): Promise<AuthContext> {
  return requireActiveBusinessContext({
    userId,
    activeBusinessId,
    explicitRole,
    allowInactiveForAssertion: true,
  });
}

/**
 * Require authenticated user or throw error (for API routes)
 */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

/**
 * Require OWNER role or throw error
 */
export async function requireOwner(): Promise<User> {
  const user = await requireAuth();
  if (user.role !== "OWNER") {
    throw new Error("FORBIDDEN_OWNER_ONLY");
  }
  return user;
}

/**
 * Invalidate session (logout)
 */
export async function destroySession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Require PLATFORM ADMIN role or throw error
 */
export async function requirePlatformAdmin(): Promise<User> {
  const user = await requireAuth();
  if (!user.isPlatformAdmin) {
    throw new Error("FORBIDDEN_PLATFORM_ADMIN_ONLY");
  }
  return user;
}

/**
 * Get SaaS Platform Overview (Platform Admin only)
 */
export async function getPlatformOverview(adminUserId: number) {
  const adminUser = await db.select().from(users).where(eq(users.id, adminUserId)).limit(1);
  if (!adminUser[0]?.isPlatformAdmin) {
    throw new Error("FORBIDDEN_PLATFORM_ADMIN_ONLY");
  }

  const allBiz = await db.select().from(businesses).orderBy(desc(businesses.createdAt));
  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      phone: users.phone,
      role: users.role,
      isActive: users.isActive,
      businessOwnerId: users.businessOwnerId,
      createdAt: users.createdAt,
    })
    .from(users);

  const allMemberships = await db.select().from(businessMemberships);
  const allProducts = await db.select({ id: products.id, businessId: products.businessId }).from(products);
  const allLedger = await db.select({ id: stockLedgerEntries.id, businessId: stockLedgerEntries.businessId }).from(stockLedgerEntries);
  const allCustomers = await db.select({ id: customers.id, businessId: customers.businessId }).from(customers);

  const allGrants = await db
    .select()
    .from(supportAccessLogs)
    .orderBy(desc(supportAccessLogs.createdAt))
    .limit(100);

  const now = new Date();

  // Map businesses with owner details, staff members, and high-level telemetry
  const businessList = allBiz.map((b) => {
    const owner = allUsers.find((u) => u.id === b.ownerUserId);
    const memberships = allMemberships.filter((m) => m.businessId === b.id);
    const staffMembers = memberships
      .filter((m) => m.role === "STAFF")
      .map((m) => {
        const u = allUsers.find((user) => user.id === m.userId);
        return {
          id: m.userId,
          membershipId: m.id,
          fullName: u?.fullName || "Staff Member",
          email: u?.email || "",
          phone: u?.phone || "",
          role: m.role,
          status: m.status,
          createdAt: m.createdAt,
        };
      });

    const activeGrant = allGrants.find((g) => {
      if (g.businessId !== b.id) return false;
      const isApproved = g.status === "APPROVED" || (!g.status && !g.revokedAt);
      const notRevoked = !g.revokedAt;
      const notExpired = g.expiresAt ? new Date(g.expiresAt) > now : false;
      return isApproved && notRevoked && notExpired;
    });

    const productCount = allProducts.filter((p) => p.businessId === b.id).length;
    const ledgerEntriesCount = allLedger.filter((l) => l.businessId === b.id).length;
    const customerCount = allCustomers.filter((c) => c.businessId === b.id).length;

    return {
      id: b.id,
      name: b.name,
      currency: b.currency,
      state: b.state, // 'ACTIVE' | 'RESTRICTED' | 'SUSPENDED'
      subscriptionPlan: b.subscriptionPlan,
      subscriptionStatus: b.subscriptionStatus, // 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'RESTRICTED' | 'SUSPENDED' | 'CANCELLED'
      trialEndsAt: b.trialEndsAt,
      createdAt: b.createdAt,
      owner: owner
        ? {
            id: owner.id,
            fullName: owner.fullName,
            email: owner.email,
            phone: owner.phone || "Not provided",
          }
        : null,
      staffMembers,
      staffCount: staffMembers.length,
      metrics: {
        productCount,
        ledgerEntriesCount,
        customerCount,
      },
      hasActiveSupportGrant: Boolean(activeGrant),
      activeSupportGrant: activeGrant || null,
    };
  });

  // Enrich support requests with business and requesting user info
  const enrichedSupportGrants = allGrants.map((g) => {
    const biz = allBiz.find((b) => b.id === g.businessId);
    const requestingUser = allUsers.find((u) => u.id === g.requestingUserId);
    const approvingAdmin = allUsers.find((u) => u.id === g.platformAdminUserId);

    let effectiveStatus = g.status || "APPROVED";
    if (g.revokedAt) {
      effectiveStatus = "REVOKED";
    } else if (g.status === "APPROVED" && g.expiresAt && new Date(g.expiresAt) <= now) {
      effectiveStatus = "EXPIRED";
    }

    return {
      id: g.id,
      businessId: g.businessId,
      businessName: biz?.name || `Business #${g.businessId}`,
      requestingUser: requestingUser
        ? {
            id: requestingUser.id,
            fullName: requestingUser.fullName,
            email: requestingUser.email,
            phone: requestingUser.phone || "",
          }
        : null,
      requestingOwnerName: requestingUser?.fullName || "Business Owner",
      approvingAdmin: approvingAdmin
        ? {
            id: approvingAdmin.id,
            fullName: approvingAdmin.fullName,
          }
        : null,
      approvingAdminName: approvingAdmin?.fullName || null,
      reason: g.reason,
      scope: g.scope,
      requestedDurationMinutes: g.requestedDurationMinutes,
      status: effectiveStatus,
      approvedAt: g.approvedAt,
      expiresAt: g.expiresAt,
      rejectedAt: g.rejectedAt,
      rejectionReason: g.rejectionReason,
      revokedAt: g.revokedAt,
      revocationReason: g.revocationReason,
      createdAt: g.createdAt,
      isActiveNow:
        effectiveStatus === "APPROVED" &&
        !g.revokedAt &&
        Boolean(g.expiresAt && new Date(g.expiresAt) > now),
    };
  });

  // Fetch recent platform security audits
  const recentPlatformAudits = await db
    .select()
    .from(auditLogs)
    .where(
      or(
        eq(auditLogs.eventType, "BUSINESS_STATUS_CHANGED"),
        eq(auditLogs.eventType, "SUBSCRIPTION_STATUS_CHANGED"),
        eq(auditLogs.eventType, "SUBSCRIPTION_PLAN_CHANGED"),
        eq(auditLogs.eventType, "SUPPORT_REQUEST_SUBMITTED"),
        eq(auditLogs.eventType, "SUPPORT_REQUEST_APPROVED"),
        eq(auditLogs.eventType, "SUPPORT_REQUEST_REJECTED"),
        eq(auditLogs.eventType, "SUPPORT_ACCESS_REVOKED"),
        eq(auditLogs.eventType, "PLATFORM_SETTINGS_CHANGED"),
        eq(auditLogs.actorRole, "PLATFORM_ADMIN")
      )
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(30);

  // Platform settings
  let settings = await db.select().from(platformSettings).limit(1);
  if (!settings[0]) {
    const [inserted] = await db
      .insert(platformSettings)
      .values({
        maintenanceMode: false,
        defaultTrialDays: 14,
        gracePeriodDays: 7,
        allowSelfRegistration: true,
      })
      .returning();
    settings = [inserted];
  }

  // Summary stats
  const totalBusinesses = allBiz.length;
  const activeBusinesses = allBiz.filter((b) => b.state === "ACTIVE").length;
  const restrictedBusinesses = allBiz.filter((b) => b.state === "RESTRICTED").length;
  const suspendedBusinesses = allBiz.filter((b) => b.state === "SUSPENDED").length;

  const trialSubscriptions = allBiz.filter((b) => b.subscriptionStatus === "TRIAL").length;
  const activeSubscriptions = allBiz.filter((b) => b.subscriptionStatus === "ACTIVE").length;
  const pastDueSubscriptions = allBiz.filter(
    (b) => b.subscriptionStatus === "PAST_DUE" || b.subscriptionStatus === "GRACE_PERIOD"
  ).length;

  const pendingSupportRequests = enrichedSupportGrants.filter(
    (g) => g.status === "PENDING"
  ).length;
  const activeSupportGrants = enrichedSupportGrants.filter((g) => g.isActiveNow).length;

  return {
    stats: {
      totalBusinesses,
      activeBusinesses,
      restrictedBusinesses,
      suspendedBusinesses,
      trialSubscriptions,
      activeSubscriptions,
      pastDueSubscriptions,
      totalUsersCount: allUsers.length,
      totalStaffCount: allUsers.filter((u) => u.role === "STAFF").length,
      pendingSupportRequests,
      activeSupportGrants,
    },
    businesses: businessList,
    supportGrants: enrichedSupportGrants,
    recentAudits: recentPlatformAudits,
    platformSettings: settings[0],
  };
}

/**
 * Update business operational state (Platform Admin only)
 * Sets state to 'ACTIVE', 'RESTRICTED', or 'SUSPENDED'
 */
export async function updateBusinessStateAdmin(params: {
  adminUserId: number;
  businessId: number;
  state: "ACTIVE" | "RESTRICTED" | "SUSPENDED";
  reason: string;
}) {
  const { adminUserId, businessId, state, reason } = params;
  const admin = await db.select().from(users).where(eq(users.id, adminUserId)).limit(1);
  if (!admin[0]?.isPlatformAdmin) {
    throw new Error("FORBIDDEN_PLATFORM_ADMIN_ONLY");
  }

  if (!reason || !reason.trim()) {
    throw new Error("An explicit justification reason is strictly required for tenant state changes.");
  }

  const [biz] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) {
    throw new Error("Business tenant not found.");
  }

  const previousState = biz.state;
  const [updatedBiz] = await db
    .update(businesses)
    .set({
      state,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, businessId))
    .returning();

  await recordSecurityAudit({
    businessId,
    actorId: adminUserId,
    actorName: admin[0].fullName,
    actorRole: "PLATFORM_ADMIN",
    eventType: "BUSINESS_STATUS_CHANGED",
    entityType: "BUSINESS",
    entityId: businessId,
    oldValue: previousState,
    newValue: state,
    description: `Platform Admin changed business "${biz.name}" state from ${previousState} to ${state}. Reason: ${reason.trim()}`,
    reason: reason.trim(),
  });

  return updatedBiz;
}

/**
 * Update business subscription state (Platform Admin only)
 */
export async function updateBusinessSubscriptionAdmin(params: {
  adminUserId: number;
  businessId: number;
  plan?: "TRIAL" | "STANDARD" | "PRO" | "GROWTH" | "ENTERPRISE" | string;
  status?: "TRIAL" | "ACTIVE" | "PAST_DUE" | "GRACE_PERIOD" | "RESTRICTED" | "SUSPENDED" | "CANCELLED";
  extendTrialDays?: number;
  reason?: string;
}) {
  const { adminUserId, businessId, plan, status, extendTrialDays, reason = "Platform admin administrative update" } = params;
  const admin = await db.select().from(users).where(eq(users.id, adminUserId)).limit(1);
  if (!admin[0]?.isPlatformAdmin) {
    throw new Error("FORBIDDEN_PLATFORM_ADMIN_ONLY");
  }

  const [biz] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) {
    throw new Error("Business not found.");
  }

  const previousPlan = biz.subscriptionPlan;
  const previousStatus = biz.subscriptionStatus;

  const updateFields: any = { updatedAt: new Date() };
  if (plan) updateFields.subscriptionPlan = plan;
  if (status) updateFields.subscriptionStatus = status;
  if (extendTrialDays && extendTrialDays > 0) {
    const baseDate = biz.trialEndsAt ? new Date(biz.trialEndsAt) : new Date();
    updateFields.trialEndsAt = new Date(baseDate.getTime() + extendTrialDays * 24 * 60 * 60 * 1000);
  }

  const [updatedBiz] = await db
    .update(businesses)
    .set(updateFields)
    .where(eq(businesses.id, businessId))
    .returning();

  await recordSecurityAudit({
    businessId,
    actorId: adminUserId,
    actorName: admin[0].fullName,
    actorRole: "PLATFORM_ADMIN",
    eventType: "SUBSCRIPTION_STATUS_CHANGED",
    entityType: "SUBSCRIPTION",
    entityId: businessId,
    oldValue: `${previousPlan} (${previousStatus})`,
    newValue: `${plan || previousPlan} (${status || previousStatus})`,
    description: `Platform Admin updated subscription for business "${biz.name}": Plan=${plan || biz.subscriptionPlan}, Status=${status || biz.subscriptionStatus}${extendTrialDays ? `, Trial extended by ${extendTrialDays} days` : ""}. Reason: ${reason}`,
    reason,
  });

  return updatedBiz;
}

/**
 * Owner initiates a formal support request
 */
export async function createSupportRequest(params: {
  requestingUserId: number;
  businessId: number;
  reason: string;
  scope: "ACCOUNT_WHATSAPP" | "CATALOG_DIAGNOSTICS" | "DEBT_RECONCILIATION" | "SYSTEM_CONFIG" | "READ_ONLY";
  requestedDurationMinutes?: number;
}) {
  const { requestingUserId, businessId, reason, scope, requestedDurationMinutes = 30 } = params;

  if (!reason || !reason.trim()) {
    throw new Error("An explicit explanation of the issue requiring support is required.");
  }

  const userRecord = await db.select().from(users).where(eq(users.id, requestingUserId)).limit(1);
  if (!userRecord[0]) {
    throw new Error("Requesting user not found.");
  }

  const biz = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz[0]) {
    throw new Error("Business not found.");
  }

  const [request] = await db
    .insert(supportAccessLogs)
    .values({
      businessId,
      requestingUserId,
      reason: reason.trim(),
      scope,
      requestedDurationMinutes,
      status: "PENDING",
    })
    .returning();

  await recordSecurityAudit({
    businessId,
    actorId: requestingUserId,
    actorName: userRecord[0].fullName,
    actorRole: "OWNER",
    eventType: "SUPPORT_REQUEST_SUBMITTED",
    entityType: "SUPPORT_ACCESS",
    entityId: request.id,
    description: `Business Owner ${userRecord[0].fullName} requested ${requestedDurationMinutes}-minute ${scope} support access. Reason: ${reason.trim()}`,
    reason: reason.trim(),
  });

  return request;
}

/**
 * Platform Admin approves a pending support request
 */
export async function approveSupportRequest(params: {
  adminUserId: number;
  grantId: number;
}) {
  const { adminUserId, grantId } = params;
  const admin = await db.select().from(users).where(eq(users.id, adminUserId)).limit(1);
  if (!admin[0]?.isPlatformAdmin) {
    throw new Error("FORBIDDEN_PLATFORM_ADMIN_ONLY");
  }

  const [grant] = await db.select().from(supportAccessLogs).where(eq(supportAccessLogs.id, grantId)).limit(1);
  if (!grant) {
    throw new Error("Support request not found.");
  }

  if (grant.status !== "PENDING") {
    throw new Error(`Cannot approve request with current status: ${grant.status}`);
  }

  const now = new Date();
  const duration = grant.requestedDurationMinutes || 30;
  const expiresAt = new Date(now.getTime() + duration * 60 * 1000);

  const [updated] = await db
    .update(supportAccessLogs)
    .set({
      platformAdminUserId: adminUserId,
      status: "APPROVED",
      approvedAt: now,
      expiresAt,
    })
    .where(eq(supportAccessLogs.id, grantId))
    .returning();

  await recordSecurityAudit({
    businessId: grant.businessId,
    actorId: adminUserId,
    actorName: admin[0].fullName,
    actorRole: "PLATFORM_ADMIN",
    eventType: "SUPPORT_REQUEST_APPROVED",
    entityType: "SUPPORT_ACCESS",
    entityId: grantId,
    description: `Platform Admin ${admin[0].fullName} approved support grant #${grantId} for business #${grant.businessId}. Scope: ${grant.scope}, Active for ${duration} minutes.`,
    reason: grant.reason,
  });

  return updated;
}

/**
 * Platform Admin rejects a pending support request
 */
export async function rejectSupportRequest(params: {
  adminUserId: number;
  grantId: number;
  rejectionReason: string;
}) {
  const { adminUserId, grantId, rejectionReason } = params;
  const admin = await db.select().from(users).where(eq(users.id, adminUserId)).limit(1);
  if (!admin[0]?.isPlatformAdmin) {
    throw new Error("FORBIDDEN_PLATFORM_ADMIN_ONLY");
  }

  if (!rejectionReason || !rejectionReason.trim()) {
    throw new Error("A rejection reason is strictly required.");
  }

  const [grant] = await db.select().from(supportAccessLogs).where(eq(supportAccessLogs.id, grantId)).limit(1);
  if (!grant) {
    throw new Error("Support request not found.");
  }

  const [updated] = await db
    .update(supportAccessLogs)
    .set({
      platformAdminUserId: adminUserId,
      status: "REJECTED",
      rejectedAt: new Date(),
      rejectionReason: rejectionReason.trim(),
    })
    .where(eq(supportAccessLogs.id, grantId))
    .returning();

  await recordSecurityAudit({
    businessId: grant.businessId,
    actorId: adminUserId,
    actorName: admin[0].fullName,
    actorRole: "PLATFORM_ADMIN",
    eventType: "SUPPORT_REQUEST_REJECTED",
    entityType: "SUPPORT_ACCESS",
    entityId: grantId,
    description: `Platform Admin ${admin[0].fullName} rejected support request #${grantId} for business #${grant.businessId}. Reason: ${rejectionReason.trim()}`,
    reason: rejectionReason.trim(),
  });

  return updated;
}

/**
 * Revoke an active support grant (Platform Admin or Owner)
 */
export async function revokeSupportAccessGrant(params: {
  actorUserId: number;
  grantId: number;
  revocationReason?: string;
}) {
  const { actorUserId, grantId, revocationReason = "Revoked by operator" } = params;
  const actor = await db.select().from(users).where(eq(users.id, actorUserId)).limit(1);
  if (!actor[0]) {
    throw new Error("User not found.");
  }

  const [grant] = await db.select().from(supportAccessLogs).where(eq(supportAccessLogs.id, grantId)).limit(1);
  if (!grant) {
    throw new Error("Support grant not found.");
  }

  const [updated] = await db
    .update(supportAccessLogs)
    .set({
      status: "REVOKED",
      revokedAt: new Date(),
      revocationReason: revocationReason.trim(),
    })
    .where(eq(supportAccessLogs.id, grantId))
    .returning();

  await recordSecurityAudit({
    businessId: grant.businessId,
    actorId: actorUserId,
    actorName: actor[0].fullName,
    actorRole: actor[0].isPlatformAdmin ? "PLATFORM_ADMIN" : "OWNER",
    eventType: "SUPPORT_ACCESS_REVOKED",
    entityType: "SUPPORT_ACCESS",
    entityId: grantId,
    description: `Support grant #${grantId} for business #${grant.businessId} revoked by ${actor[0].fullName}. Reason: ${revocationReason}`,
    reason: revocationReason,
  });

  return updated;
}

/**
 * Update Platform Settings (Platform Admin only)
 */
export async function updatePlatformSettingsAdmin(params: {
  adminUserId: number;
  maintenanceMode?: boolean;
  maintenanceNotice?: string;
  defaultTrialDays?: number;
  gracePeriodDays?: number;
  allowSelfRegistration?: boolean;
}) {
  const { adminUserId, ...settingsFields } = params;
  const admin = await db.select().from(users).where(eq(users.id, adminUserId)).limit(1);
  if (!admin[0]?.isPlatformAdmin) {
    throw new Error("FORBIDDEN_PLATFORM_ADMIN_ONLY");
  }

  let existing = await db.select().from(platformSettings).limit(1);
  let updated;
  if (existing[0]) {
    [updated] = await db
      .update(platformSettings)
      .set({
        ...settingsFields,
        updatedAt: new Date(),
      })
      .where(eq(platformSettings.id, existing[0].id))
      .returning();
  } else {
    [updated] = await db
      .insert(platformSettings)
      .values({
        maintenanceMode: settingsFields.maintenanceMode ?? false,
        maintenanceNotice: settingsFields.maintenanceNotice || null,
        defaultTrialDays: settingsFields.defaultTrialDays ?? 14,
        gracePeriodDays: settingsFields.gracePeriodDays ?? 7,
        allowSelfRegistration: settingsFields.allowSelfRegistration ?? true,
      })
      .returning();
  }

  await recordSecurityAudit({
    businessId: 0,
    actorId: adminUserId,
    actorName: admin[0].fullName,
    actorRole: "PLATFORM_ADMIN",
    eventType: "PLATFORM_SETTINGS_CHANGED",
    entityType: "PLATFORM_SETTINGS",
    entityId: updated.id,
    description: `Platform Admin updated global settings: MaintenanceMode=${updated.maintenanceMode}, DefaultTrial=${updated.defaultTrialDays}d, GracePeriod=${updated.gracePeriodDays}d`,
  });

  return updated;
}

export { SESSION_COOKIE_NAME, SESSION_DURATION_MS };
