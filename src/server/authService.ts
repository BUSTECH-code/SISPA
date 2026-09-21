import { db } from "@/db";
import { users, sessions, type User, type Session } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "sispa_session_id";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

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
 * Resolve tenant business ID and user role
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
 * Create a new user (OWNER or STAFF)
 */
export async function createUser(params: {
  email: string;
  password: string;
  fullName: string;
  businessName?: string;
  role?: "OWNER" | "STAFF";
  businessOwnerId?: number | null;
}): Promise<User> {
  const {
    email,
    password,
    fullName,
    businessName = "My Building Materials Shop",
    role = "OWNER",
    businessOwnerId = null,
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
      role,
      businessName: businessName.trim(),
      businessOwnerId,
      isActive: true,
    })
    .returning();

  return newUser;
}

/**
 * Owner creates a staff member
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

/**
 * List staff members belonging to a shop owner
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

export { SESSION_COOKIE_NAME, SESSION_DURATION_MS };
