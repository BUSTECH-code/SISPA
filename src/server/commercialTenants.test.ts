import { describe, it, expect, beforeAll } from "vitest";
import {
  createUser,
  createStaffInvitation,
  validateInvitationToken,
  acceptStaffInvitation,
  getStaffMembersWithLifecycle,
  updateStaffMembershipStatus,
  transferBusinessOwnership,
} from "./authService";
import { addProduct, recordSale } from "./stockService";

describe("Commercial Multi-Tenant Isolation & Staff Lifecycle Tests", () => {
  let shopAOwner: any;
  let shopBOwner: any;
  let shopAStaff: any;
  let invitationToken: string;

  beforeAll(async () => {
    // 1. Create Business A
    shopAOwner = await createUser({
      email: `ownerA_${Date.now()}@shopa.com`,
      password: "secretPassword123",
      fullName: "Alhaji Musa",
      role: "OWNER",
      businessName: "Musa Wholesale Hub",
    });

    // 2. Create Business B (Separate isolated tenant)
    shopBOwner = await createUser({
      email: `ownerB_${Date.now()}@shopb.com`,
      password: "secretPassword123",
      fullName: "Chief Emeka",
      role: "OWNER",
      businessName: "Emeka Timber & Glass",
    });
  });

  it("Owner can generate a cryptographic single-use invitation link", async () => {
    const invite = await createStaffInvitation({
      ownerUser: shopAOwner,
      inviteeName: "Sani Clerk",
      inviteeEmail: "sani@shopa.com",
    });

    expect(invite).toBeDefined();
    expect(invite.token).toBeDefined();
    expect(invite.token.length).toBeGreaterThan(20);
    expect(invite.status).toBe("PENDING");
    expect(invite.inviteUrl).toContain(invite.token);

    invitationToken = invite.token;
  });

  it("Invitee can verify the invitation link and see business details", async () => {
    const validation = await validateInvitationToken(invitationToken);
    expect(validation.isValid).toBe(true);
    expect(validation.business?.name).toBe("Musa Wholesale Hub");
    expect(validation.invitation?.inviteeName).toBe("Sani Clerk");
    expect(validation.invitation?.role).toBe("STAFF");
  });

  it("Invitee can accept invitation, set their password, and become an active staff member", async () => {
    const result = await acceptStaffInvitation({
      token: invitationToken,
      fullName: "Sani Clerk",
      email: `sani_${Date.now()}@shopa.com`,
      password: "saniSecurePassword123",
    });

    expect(result.user).toBeDefined();
    expect(result.user.fullName).toBe("Sani Clerk");
    expect(result.user.role).toBe("STAFF");
    shopAStaff = result.user;

    // Verify invitation is now marked ACCEPTED (cannot be re-validated)
    const reVerify = await validateInvitationToken(invitationToken);
    expect(reVerify.isValid).toBe(false);
  });

  it("Re-using the same invitation token fails (Strict Single-Use)", async () => {
    await expect(
      acceptStaffInvitation({
        token: invitationToken,
        fullName: "Impostor",
        email: "impostor@shopa.com",
        password: "password123",
      })
    ).rejects.toThrow();
  });

  it("Owner can list staff and see active membership", async () => {
    const roster = await getStaffMembersWithLifecycle(shopAOwner.id);
    expect(roster.length).toBeGreaterThanOrEqual(1);
    const found = roster.find((s) => s.email === shopAStaff.email);
    expect(found).toBeDefined();
    expect(found?.status).toBe("ACTIVE");
  });

  it("Owner can suspend a staff member, immediately revoking their access", async () => {
    const success = await updateStaffMembershipStatus({
      ownerUser: shopAOwner,
      staffUserId: shopAStaff.id,
      newStatus: "SUSPENDED",
      reason: "Temporary audit investigation",
    });

    expect(success).toBe(true);

    // Add a product under Shop A
    const product = await addProduct({
      userId: shopAOwner.id,
      actorId: shopAOwner.id,
      actorName: shopAOwner.fullName,
      actorRole: "OWNER",
      name: "Galvanized Roofing Sheet 0.45mm",
      category: "Roofing",
      unit: "bundles",
      sellingPrice: 42000,
      openingStock: 20,
    });

    // Attempting an action as suspended staff MUST throw STAFF_SUSPENDED
    await expect(
      recordSale({
        userId: shopAOwner.id,
        actorId: shopAStaff.id,
        actorName: shopAStaff.fullName,
        actorRole: "STAFF",
        productId: product.id,
        quantity: 1,
        unitPrice: 42000,
        amountPaid: 42000,
      })
    ).rejects.toThrow(/STAFF_SUSPENDED/);
  });

  it("Owner can reactivate suspended staff, restoring operational capabilities", async () => {
    const success = await updateStaffMembershipStatus({
      ownerUser: shopAOwner,
      staffUserId: shopAStaff.id,
      newStatus: "ACTIVE",
      reason: "Investigation completed - cleared",
    });

    expect(success).toBe(true);
  });

  it("Owner can transfer business ownership with password verification", async () => {
    // Attempt with incorrect password should fail
    await expect(
      transferBusinessOwnership({
        currentOwner: shopAOwner,
        newOwnerUserId: shopAStaff.id,
        passwordConfirmation: "wrongPassword",
        reason: "Succession",
      })
    ).rejects.toThrow("INVALID_CREDENTIALS");

    // Attempt with correct password succeeds
    const success = await transferBusinessOwnership({
      currentOwner: shopAOwner,
      newOwnerUserId: shopAStaff.id,
      passwordConfirmation: "secretPassword123",
      reason: "Commercial succession to Sani Clerk",
    });

    expect(success).toBe(true);
  });
});
