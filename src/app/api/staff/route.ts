import { NextResponse } from "next/server";
import {
  requireOwner,
  getStaffMembersWithLifecycle,
  getStaffInvitations,
  createStaffInvitation,
  revokeStaffInvitation,
  updateStaffMembershipStatus,
  updateStaffCapabilities,
  transferBusinessOwnership,
  createStaffMember,
  ensureBusinessForOwner,
} from "@/server/authService";

export const dynamic = "force-dynamic";

/**
 * GET /api/staff - List staff members with full lifecycle status + pending invitations
 */
export async function GET() {
  try {
    const owner = await requireOwner();
    const business = await ensureBusinessForOwner(owner);

    const [staff, invitations] = await Promise.all([
      getStaffMembersWithLifecycle(owner.id),
      getStaffInvitations(business.id),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        staff,
        invitations,
        business: {
          id: business.id,
          name: business.name,
          state: business.state,
          ownerUserId: business.ownerUserId,
        },
      },
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    if (error.message === "FORBIDDEN_OWNER_ONLY") {
      return NextResponse.json({ success: false, error: "Only the shop owner can manage staff." }, { status: 403 });
    }
    console.error("Failed to list staff:", error);
    return NextResponse.json({ success: false, error: "Failed to load staff list." }, { status: 500 });
  }
}

/**
 * POST /api/staff - Generate invitation link/QR OR create staff directly
 */
export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    const body = await request.json();
    const { action = "INVITE", email, fullName, password, origin } = body;

    // Direct legacy creation if password provided
    if (action === "CREATE_DIRECT" || password) {
      if (!email || !email.includes("@")) {
        return NextResponse.json({ success: false, error: "Enter a valid email address." }, { status: 400 });
      }
      if (!password || password.length < 6) {
        return NextResponse.json({ success: false, error: "Staff password must be at least 6 characters." }, { status: 400 });
      }
      if (!fullName || !fullName.trim()) {
        return NextResponse.json({ success: false, error: "Enter the staff member's name." }, { status: 400 });
      }

      const newStaff = await createStaffMember({
        ownerUser: owner,
        email,
        password,
        fullName,
      });

      return NextResponse.json({
        success: true,
        data: {
          id: newStaff.id,
          email: newStaff.email,
          fullName: newStaff.fullName,
          role: newStaff.role,
        },
        message: `Staff account created for ${newStaff.fullName}.`,
      });
    }

    // Default commercial invitation flow (Section 4)
    if (!fullName || !fullName.trim()) {
      return NextResponse.json({ success: false, error: "Please provide the name of the staff member to invite." }, { status: 400 });
    }

    const { customCapabilities } = body;

    const invitation = await createStaffInvitation({
      ownerUser: owner,
      inviteeName: fullName.trim(),
      inviteeEmail: email ? email.trim() : undefined,
      customCapabilities: Array.isArray(customCapabilities) ? customCapabilities : undefined,
      origin: origin || request.headers.get("origin") || undefined,
    });

    return NextResponse.json({
      success: true,
      data: invitation,
      message: `Single-use invitation link generated for ${invitation.inviteeName}.`,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    if (error.message === "FORBIDDEN_OWNER_ONLY" || error.message === "FORBIDDEN_STAFF_MANAGE") {
      return NextResponse.json({ success: false, error: "Only the shop owner can invite staff." }, { status: 403 });
    }
    console.error("Failed to create staff/invitation:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to process request." }, { status: 400 });
  }
}

/**
 * PATCH /api/staff - Lifecycle status management & Ownership transfer
 */
export async function PATCH(request: Request) {
  try {
    const owner = await requireOwner();
    const body = await request.json();
    const { action, staffUserId, newStatus, reason, newOwnerUserId, passwordConfirmation, capabilities } = body;

    // 1. Staff Lifecycle Status Change (ACTIVE, SUSPENDED, DEACTIVATED)
    if (action === "UPDATE_STATUS") {
      if (!staffUserId || !newStatus) {
        return NextResponse.json({ success: false, error: "Missing staffUserId or newStatus." }, { status: 400 });
      }

      await updateStaffMembershipStatus({
        ownerUser: owner,
        staffUserId: Number(staffUserId),
        newStatus,
        reason,
      });

      return NextResponse.json({
        success: true,
        message: `Staff member status updated to ${newStatus}.`,
      });
    }

    // 2. Staff Capability Delegation Update
    if (action === "UPDATE_CAPABILITIES") {
      if (!staffUserId || !Array.isArray(capabilities)) {
        return NextResponse.json({ success: false, error: "Missing staffUserId or capabilities list." }, { status: 400 });
      }

      await updateStaffCapabilities({
        ownerUser: owner,
        staffUserId: Number(staffUserId),
        capabilities,
      });

      return NextResponse.json({
        success: true,
        message: "Staff capabilities updated successfully.",
      });
    }

    // 2. Protected Ownership Transfer (Section 16)
    if (action === "TRANSFER_OWNERSHIP") {
      if (!newOwnerUserId || !passwordConfirmation) {
        return NextResponse.json({ success: false, error: "Please select a successor and enter your password to confirm." }, { status: 400 });
      }

      await transferBusinessOwnership({
        currentOwner: owner,
        newOwnerUserId: Number(newOwnerUserId),
        passwordConfirmation,
        reason,
      });

      return NextResponse.json({
        success: true,
        message: "Business ownership successfully transferred.",
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action." }, { status: 400 });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    if (error.message === "INVALID_CREDENTIALS") {
      return NextResponse.json({ success: false, error: "Incorrect owner password confirmation." }, { status: 403 });
    }
    console.error("Failed staff action:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to update staff." }, { status: 400 });
  }
}

/**
 * DELETE /api/staff - Revoke staff invitation
 */
export async function DELETE(request: Request) {
  try {
    const owner = await requireOwner();
    const { searchParams } = new URL(request.url);
    const invitationId = searchParams.get("invitationId");

    if (!invitationId) {
      return NextResponse.json({ success: false, error: "Missing invitationId." }, { status: 400 });
    }

    const success = await revokeStaffInvitation({
      ownerUser: owner,
      invitationId: Number(invitationId),
    });

    if (!success) {
      return NextResponse.json({ success: false, error: "Invitation not found or cannot be revoked." }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Staff invitation revoked.",
    });
  } catch (error: any) {
    console.error("Failed to revoke invitation:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to revoke invitation." }, { status: 400 });
  }
}
