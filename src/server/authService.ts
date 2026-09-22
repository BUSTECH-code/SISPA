import { db } from "@/db";
import {
  users,
  sessions,
  businesses,
  businessMemberships,
  staffInvitations,
  businessSubscriptions,
  supportAccessLogs,
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
 * Resolve tenant business ID and user role (backward-compatible)
 */
export function resolveBusinessContext(user: User): {
  businessId: number;
  userRole: "OWNER" | "STAFF";
  actorId: number;
  actorName: string;
} {
  const userRole = (user.role as "OWNER" | "STAFF") || "OWNER";
  const businessId = userRole === "STAFF" && user.businessOwnerId ? user.businessOwnerId : user.id;

  return {
    businessId,
    userRole,
    actorId: user.id,
    actorName: user.fullName,
  };
}

/**
 * Get or automatically ensure a commercial business entity exists for an owner
 */
export async function ensureBusinessForOwner(ownerUser: User): Promise<Business> {
  try {
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
  } catch (error) {
    console.error("[SISPA Auth] Error ensuring business for owner:", error);
    // Return virtual fallback if DB has transient issue
    return {
      id: ownerUser.id,
      name: ownerUser.businessName,
      currency: "NGN",
      state: "ACTIVE",
      ownerUserId: ownerUser.id,
      subscriptionPlan: "STANDARD",
      subscriptionStatus: "TRIAL",
      trialEndsAt: null,
      currentPeriodEnd: null,
      createdAt: ownerUser.createdAt,
      updatedAt: ownerUser.updatedAt,
    };
  }
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
  expiresAt: Date;
  businessName: string;
}

/**
 * Generate a secure, single-use, short-lived staff invitation
 */
export async function createStaffInvitation(params: {
  ownerUser: User;
  inviteeName: string;
  inviteeEmail?: string;
  role?: "STAFF";
  origin?: string;
}): Promise<StaffInvitationResponse> {
  const { ownerUser, inviteeName, inviteeEmail, role = "STAFF", origin = "" } = params;

  if (ownerUser.role !== "OWNER") {
    throw new Error("FORBIDDEN_STAFF_MANAGE");
  }

  const business = await ensureBusinessForOwner(ownerUser);
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);

  const [invitation] = await db
    .insert(staffInvitations)
    .values({
      businessId: business.id,
      token,
      inviteeEmail: inviteeEmail?.toLowerCase().trim() || null,
      inviteeName: inviteeName.trim(),
      role,
      invitedByUserId: ownerUser.id,
      status: "PENDING",
      expiresAt,
    })
    .returning();

  // Audit invitation generation
  await recordSecurityAudit({
    businessId: business.id,
    actorId: ownerUser.id,
    actorName: ownerUser.fullName,
    actorRole: "OWNER",
    eventType: "STAFF_INVITED",
    description: `Generated staff invitation for ${inviteeName}${inviteeEmail ? ` (${inviteeEmail})` : ""}`,
    entityType: "staff_invitations",
    entityId: invitation.id,
    afterState: { inviteeName, inviteeEmail, expiresAt },
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
    expiresAt: invitation.expiresAt,
    businessName: business.name,
  };
}

/**
 * List pending and past staff invitations for a business
 */
export async function getStaffInvitations(businessId: number): Promise<StaffInvitation[]> {
  try {
    return await db
      .select()
      .from(staffInvitations)
      .where(eq(staffInvitations.businessId, businessId))
      .orderBy(desc(staffInvitations.createdAt));
  } catch (error) {
    console.error("[SISPA Auth] Error fetching invitations:", error);
    return [];
  }
}

/**
 * Revoke a pending staff invitation
 */
export async function revokeStaffInvitation(params: {
  ownerUser: User;
  invitationId: number;
}): Promise<boolean> {
  const { ownerUser, invitationId } = params;
  if (ownerUser.role !== "OWNER") {
    throw new Error("FORBIDDEN_STAFF_MANAGE");
  }

  const business = await ensureBusinessForOwner(ownerUser);

  const [existing] = await db
    .select()
    .from(staffInvitations)
    .where(and(eq(staffInvitations.id, invitationId), eq(staffInvitations.businessId, business.id)))
    .limit(1);

  if (!existing || existing.status !== "PENDING") {
    return false;
  }

  await db
    .update(staffInvitations)
    .set({ status: "REVOKED" })
    .where(eq(staffInvitations.id, invitationId));

  await recordSecurityAudit({
    businessId: business.id,
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

  // Ensure membership is created and set to ACTIVE
  await db
    .insert(businessMemberships)
    .values({
      businessId: business.id,
      userId: newUser.id,
      role: "STAFF",
      status: "ACTIVE",
      activatedAt: new Date(),
      invitedByUserId: invitation.invitedByUserId,
      invitedAt: invitation.createdAt,
    })
    .onConflictDoUpdate({
      target: [businessMemberships.businessId, businessMemberships.userId],
      set: { status: "ACTIVE", activatedAt: new Date() },
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

  const session = await createSession(newUser.id);
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
  invitedAt: Date | null;
  activatedAt: Date | null;
  suspendedAt: Date | null;
  deactivatedAt: Date | null;
  createdAt: Date;
}

/**
 * List staff members with comprehensive lifecycle status
 */
export async function getStaffMembersWithLifecycle(ownerId: number): Promise<StaffMemberDetail[]> {
  try {
    const bizList = await db
      .select()
      .from(businesses)
      .where(eq(businesses.ownerUserId, ownerId))
      .limit(1);

    if (bizList.length === 0) {
      return [];
    }

    const businessId = bizList[0].id;

    const list = await db
      .select({
        membershipId: businessMemberships.id,
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        role: businessMemberships.role,
        status: businessMemberships.status,
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

    return list.map((item) => ({
      id: item.membershipId,
      userId: item.userId,
      fullName: item.fullName,
      email: item.email,
      role: item.role as MembershipRole,
      status: item.status as MembershipStatus,
      invitedAt: item.invitedAt,
      activatedAt: item.activatedAt,
      suspendedAt: item.suspendedAt,
      deactivatedAt: item.deactivatedAt,
      createdAt: item.createdAt,
    }));
  } catch (error) {
    console.error("[SISPA Auth] Error fetching staff with lifecycle:", error);
    // Fallback to legacy users table
    const legacy = await getStaffMembers(ownerId);
    return legacy.map((u) => ({
      id: u.id,
      userId: u.id,
      fullName: u.fullName,
      email: u.email,
      role: "STAFF" as MembershipRole,
      status: (u.isActive ? "ACTIVE" : "SUSPENDED") as MembershipStatus,
      invitedAt: null,
      activatedAt: u.createdAt,
      suspendedAt: null,
      deactivatedAt: null,
      createdAt: u.createdAt,
    }));
  }
}

/**
 * Update staff membership lifecycle status (ACTIVE, SUSPENDED, DEACTIVATED).
 * When SUSPENDED or DEACTIVATED, immediately invalidates all active sessions.
 */
export async function updateStaffMembershipStatus(params: {
  ownerUser: User;
  staffUserId: number;
  newStatus: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  reason?: string;
}): Promise<boolean> {
  const { ownerUser, staffUserId, newStatus, reason } = params;

  if (ownerUser.role !== "OWNER") {
    throw new Error("FORBIDDEN_STAFF_MANAGE");
  }

  if (ownerUser.id === staffUserId) {
    throw new Error("CANNOT_MODIFY_OWN_MEMBERSHIP");
  }

  const business = await ensureBusinessForOwner(ownerUser);

  const [membership] = await db
    .select()
    .from(businessMemberships)
    .where(and(eq(businessMemberships.businessId, business.id), eq(businessMemberships.userId, staffUserId)))
    .limit(1);

  const [staffUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, staffUserId))
    .limit(1);

  if (!staffUser) {
    throw new Error("Staff user not found.");
  }

  const previousStatus = membership?.status || (staffUser.isActive ? "ACTIVE" : "SUSPENDED");
  const now = new Date();

  // Update membership
  await db
    .insert(businessMemberships)
    .values({
      businessId: business.id,
      userId: staffUserId,
      role: "STAFF",
      status: newStatus,
      suspendedAt: newStatus === "SUSPENDED" ? now : null,
      deactivatedAt: newStatus === "DEACTIVATED" ? now : null,
      activatedAt: newStatus === "ACTIVE" ? now : membership?.activatedAt || now,
    })
    .onConflictDoUpdate({
      target: [businessMemberships.businessId, businessMemberships.userId],
      set: {
        status: newStatus,
        suspendedAt: newStatus === "SUSPENDED" ? now : null,
        deactivatedAt: newStatus === "DEACTIVATED" ? now : null,
      },
    });

  // Update user active flag
  await db
    .update(users)
    .set({ isActive: newStatus === "ACTIVE" })
    .where(eq(users.id, staffUserId));

  // If suspended or deactivated, revoke all active sessions immediately
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
    businessId: business.id,
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

// ============================================================================
// PROTECTED OWNERSHIP TRANSFER (Section 16)
// ============================================================================

export async function transferBusinessOwnership(params: {
  currentOwner: User;
  newOwnerUserId: number;
  passwordConfirmation: string;
  reason?: string;
}): Promise<boolean> {
  const { currentOwner, newOwnerUserId, passwordConfirmation, reason } = params;

  if (currentOwner.role !== "OWNER") {
    throw new Error("FORBIDDEN_OWNERSHIP_TRANSFER");
  }

  // Re-authentication check
  const isPasswordValid = await verifyPassword(passwordConfirmation, currentOwner.passwordHash);
  if (!isPasswordValid) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const business = await ensureBusinessForOwner(currentOwner);

  // Validate eligible candidate
  const [newOwnerUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, newOwnerUserId))
    .limit(1);

  if (!newOwnerUser || !newOwnerUser.isActive) {
    throw new Error("NEW_OWNER_NOT_ACTIVE");
  }

  // Update business owner
  await db
    .update(businesses)
    .set({ ownerUserId: newOwnerUserId, updatedAt: new Date() })
    .where(eq(businesses.id, business.id));

  // Update membership for new owner
  await db
    .update(businessMemberships)
    .set({ role: "OWNER", updatedAt: new Date() })
    .where(and(eq(businessMemberships.businessId, business.id), eq(businessMemberships.userId, newOwnerUserId)));

  // Demote previous owner to STAFF
  await db
    .update(businessMemberships)
    .set({ role: "STAFF", updatedAt: new Date() })
    .where(and(eq(businessMemberships.businessId, business.id), eq(businessMemberships.userId, currentOwner.id)));

  // Update users table roles
  await db.update(users).set({ role: "OWNER" }).where(eq(users.id, newOwnerUserId));
  await db.update(users).set({ role: "STAFF", businessOwnerId: newOwnerUserId }).where(eq(users.id, currentOwner.id));

  // Audit event
  await recordSecurityAudit({
    businessId: business.id,
    actorId: currentOwner.id,
    actorName: currentOwner.fullName,
    actorRole: "OWNER",
    eventType: "BUSINESS_OWNERSHIP_TRANSFERRED",
    description: `Transferred business ownership of "${business.name}" from ${currentOwner.fullName} to ${newOwnerUser.fullName}`,
    entityType: "businesses",
    entityId: business.id,
    beforeState: { ownerUserId: currentOwner.id, ownerName: currentOwner.fullName },
    afterState: { ownerUserId: newOwnerUserId, ownerName: newOwnerUser.fullName },
    reason: reason || "Owner initiated ownership transfer",
  });

  return true;
}

// ============================================================================
// SESSIONS & USER CONTEXT
// ============================================================================

/**
 * List staff members belonging to a shop owner (legacy)
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
 * Create a new session for user
 */
export async function createSession(userId: number): Promise<Session> {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const [session] = await db
    .insert(sessions)
    .values({
      id: sessionId,
      userId,
      expiresAt,
    })
    .returning();

  return session;
}

/**
 * Get authenticated user from session cookie
 */
export async function getCurrentUser(): Promise<User | null> {
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

    // Check expiration or active status
    if (new Date(session.expiresAt) < now || !user.isActive) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      return null;
    }

    return user;
  } catch (err) {
    console.error("Error retrieving current user:", err);
    return null;
  }
}

/**
 * Get full authoritative AuthContext for current session
 */
export async function getCurrentAuthContext(): Promise<AuthContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const userRole = (user.role as MembershipRole) || "OWNER";
  const businessOwnerId = userRole === "STAFF" && user.businessOwnerId ? user.businessOwnerId : user.id;

  let biz: Business;
  try {
    const bizList = await db
      .select()
      .from(businesses)
      .where(eq(businesses.ownerUserId, businessOwnerId))
      .limit(1);

    if (bizList.length > 0) {
      biz = bizList[0];
    } else {
      biz = await ensureBusinessForOwner(user);
    }
  } catch {
    biz = {
      id: businessOwnerId,
      name: user.businessName,
      currency: "NGN",
      state: "ACTIVE",
      ownerUserId: businessOwnerId,
      subscriptionPlan: "STANDARD",
      subscriptionStatus: "TRIAL",
      trialEndsAt: null,
      currentPeriodEnd: null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  let membershipStatus: MembershipStatus = user.isActive ? "ACTIVE" : "SUSPENDED";
  let customCaps: Capability[] = [];

  try {
    const memberList = await db
      .select()
      .from(businessMemberships)
      .where(and(eq(businessMemberships.businessId, biz.id), eq(businessMemberships.userId, user.id)))
      .limit(1);

    if (memberList.length > 0) {
      membershipStatus = memberList[0].status as MembershipStatus;
      if (memberList[0].customCapabilities) {
        customCaps = JSON.parse(memberList[0].customCapabilities);
      }
    }
  } catch {
    // Keep fallback
  }

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
      ownerUserId: biz.ownerUserId || businessOwnerId,
      subscriptionPlan: biz.subscriptionPlan as any,
      subscriptionStatus: biz.subscriptionStatus as any,
      trialEndsAt: biz.trialEndsAt,
      currentPeriodEnd: biz.currentPeriodEnd,
    },
    membership: {
      id: user.id,
      role: userRole,
      status: membershipStatus,
      customCapabilities: customCaps,
    },
  };
}

/**
 * Resolve full authoritative AuthContext for a given userId
 */
export async function getAuthContextForUser(
  userId: number,
  explicitRole?: "OWNER" | "STAFF"
): Promise<AuthContext | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  const userRole = (explicitRole || user.role || "OWNER") as MembershipRole;
  const businessOwnerId =
    userRole === "STAFF" && user.businessOwnerId ? user.businessOwnerId : user.id;

  let biz: Business;
  try {
    const [membershipRecord] = await db
      .select()
      .from(businessMemberships)
      .where(eq(businessMemberships.userId, user.id))
      .limit(1);

    if (membershipRecord) {
      const [b] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, membershipRecord.businessId))
        .limit(1);
      if (b) {
        biz = b;
      } else {
        biz = await ensureBusinessForOwner(user);
      }
    } else {
      const bizList = await db
        .select()
        .from(businesses)
        .where(eq(businesses.ownerUserId, businessOwnerId))
        .limit(1);

      if (bizList.length > 0) {
        biz = bizList[0];
      } else {
        biz = await ensureBusinessForOwner(user);
      }
    }
  } catch {
    biz = {
      id: businessOwnerId,
      name: user.businessName,
      currency: "NGN",
      state: "ACTIVE",
      ownerUserId: businessOwnerId,
      subscriptionPlan: "STANDARD",
      subscriptionStatus: "TRIAL",
      trialEndsAt: null,
      currentPeriodEnd: null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  let membershipStatus: MembershipStatus = user.isActive ? "ACTIVE" : "SUSPENDED";
  let customCaps: Capability[] = [];

  try {
    const memberList = await db
      .select()
      .from(businessMemberships)
      .where(and(eq(businessMemberships.businessId, biz.id), eq(businessMemberships.userId, user.id)))
      .limit(1);

    if (memberList.length > 0) {
      membershipStatus = memberList[0].status as MembershipStatus;
      if (memberList[0].customCapabilities) {
        customCaps = JSON.parse(memberList[0].customCapabilities);
      }
    }
  } catch {
    // Keep fallback
  }

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
      ownerUserId: biz.ownerUserId || businessOwnerId,
      subscriptionPlan: biz.subscriptionPlan as any,
      subscriptionStatus: biz.subscriptionStatus as any,
      trialEndsAt: biz.trialEndsAt,
      currentPeriodEnd: biz.currentPeriodEnd,
    },
    membership: {
      id: user.id,
      role: userRole,
      status: membershipStatus,
      customCapabilities: customCaps,
    },
  };
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
      role: users.role,
      isActive: users.isActive,
      businessOwnerId: users.businessOwnerId,
      createdAt: users.createdAt,
    })
    .from(users);

  const allGrants = await db.select().from(supportAccessLogs).orderBy(desc(supportAccessLogs.createdAt)).limit(50);

  const businessList = allBiz.map((b) => {
    const owner = allUsers.find((u) => u.id === b.ownerUserId);
    const members = allUsers.filter((u) => u.businessOwnerId === b.ownerUserId || u.id === b.ownerUserId);
    const activeGrant = allGrants.find(
      (g) => g.businessId === b.id && !g.revokedAt && new Date(g.expiresAt) > new Date()
    );
    return {
      id: b.id,
      name: b.name,
      currency: b.currency,
      state: b.state,
      subscriptionPlan: b.subscriptionPlan,
      subscriptionStatus: b.subscriptionStatus,
      trialEndsAt: b.trialEndsAt,
      createdAt: b.createdAt,
      owner: owner ? { id: owner.id, fullName: owner.fullName, email: owner.email } : null,
      memberCount: members.length,
      hasActiveSupportGrant: !!activeGrant,
      activeSupportGrant: activeGrant || null,
    };
  });

  const totalBusinesses = allBiz.length;
  const activeBusinesses = allBiz.filter((b) => b.state === "ACTIVE").length;
  const trialSubscriptions = allBiz.filter((b) => b.subscriptionStatus === "TRIAL").length;
  const activeSubscriptions = allBiz.filter((b) => b.subscriptionStatus === "ACTIVE").length;
  const totalUsersCount = allUsers.length;
  const totalStaffCount = allUsers.filter((u) => u.role === "STAFF").length;

  return {
    stats: {
      totalBusinesses,
      activeBusinesses,
      trialSubscriptions,
      activeSubscriptions,
      totalUsersCount,
      totalStaffCount,
    },
    businesses: businessList,
    recentSupportGrants: allGrants,
  };
}

/**
 * Create an explicit, scoped support access grant (Platform Admin only)
 */
export async function createSupportAccessGrant(params: {
  adminUserId: number;
  businessId: number;
  reason: string;
  scope?: "READ_ONLY" | "FULL";
  durationMinutes?: number;
}) {
  const { adminUserId, businessId, reason, scope = "READ_ONLY", durationMinutes = 30 } = params;
  const admin = await db.select().from(users).where(eq(users.id, adminUserId)).limit(1);
  if (!admin[0]?.isPlatformAdmin) {
    throw new Error("FORBIDDEN_PLATFORM_ADMIN_ONLY");
  }

  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  const [grant] = await db
    .insert(supportAccessLogs)
    .values({
      businessId,
      platformAdminUserId: adminUserId,
      reason: reason.trim(),
      scope,
      expiresAt,
    })
    .returning();

  await recordSecurityAudit({
    businessId,
    actorId: adminUserId,
    actorName: admin[0].fullName,
    actorRole: "PLATFORM_ADMIN",
    eventType: "SUPPORT_ACCESS_GRANTED",
    entityType: "SUPPORT_ACCESS",
    entityId: grant?.id,
    description: `Platform Admin granted ${scope} support access to business #${businessId} for ${durationMinutes} minutes. Reason: ${reason}`,
    reason,
  });

  return grant;
}

/**
 * Revoke support access grant (Platform Admin only)
 */
export async function revokeSupportAccessGrant(params: {
  adminUserId: number;
  grantId: number;
}) {
  const { adminUserId, grantId } = params;
  const admin = await db.select().from(users).where(eq(users.id, adminUserId)).limit(1);
  if (!admin[0]?.isPlatformAdmin) {
    throw new Error("FORBIDDEN_PLATFORM_ADMIN_ONLY");
  }

  const [updated] = await db
    .update(supportAccessLogs)
    .set({ revokedAt: new Date() })
    .where(eq(supportAccessLogs.id, grantId))
    .returning();

  if (updated) {
    await recordSecurityAudit({
      businessId: updated.businessId,
      actorId: adminUserId,
      actorName: admin[0].fullName,
      actorRole: "PLATFORM_ADMIN",
      eventType: "SUPPORT_ACCESS_REVOKED",
      entityType: "SUPPORT_ACCESS",
      entityId: grantId,
      description: `Platform Admin revoked support access grant #${grantId} for business #${updated.businessId}.`,
    });
  }

  return updated;
}

/**
 * Update business subscription state from Platform Admin Console
 */
export async function updateBusinessSubscriptionAdmin(params: {
  adminUserId: number;
  businessId: number;
  plan?: "TRIAL" | "STANDARD" | "PRO" | "ENTERPRISE";
  status?: "TRIAL" | "ACTIVE" | "PAST_DUE" | "GRACE_PERIOD" | "RESTRICTED" | "SUSPENDED" | "CANCELLED";
  extendTrialDays?: number;
}) {
  const { adminUserId, businessId, plan, status, extendTrialDays } = params;
  const admin = await db.select().from(users).where(eq(users.id, adminUserId)).limit(1);
  if (!admin[0]?.isPlatformAdmin) {
    throw new Error("FORBIDDEN_PLATFORM_ADMIN_ONLY");
  }

  const [biz] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) {
    throw new Error("Business not found.");
  }

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
    description: `Platform Admin updated subscription for business "${biz.name}": Plan=${plan || biz.subscriptionPlan}, Status=${status || biz.subscriptionStatus}.`,
  });

  return updatedBiz;
}

export { SESSION_COOKIE_NAME, SESSION_DURATION_MS };
