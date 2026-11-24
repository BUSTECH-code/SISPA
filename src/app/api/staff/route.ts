import { NextResponse } from "next/server";
import {
  requireRouteBusinessContext,
  getStaffMembersWithLifecycle,
  getStaffInvitations,
  createStaffInvitation,
  revokeStaffInvitation,
  updateStaffMembershipStatus,
  updateStaffCapabilities,
  transferBusinessOwnership,
  createStaffMember,
} from "@/server/authService";
import { assertCan } from "@/server/authorization";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

/**
 * GET /api/staff - List staff members with full lifecycle status + pending invitations
 */
export async function GET(request: Request) {
  try {
    const { authContext, businessId } = await requireRouteBusinessContext(request);
    assertCan(authContext, "STAFF_MANAGE", { businessId });

    const [staff, invitations] = await Promise.all([
      getStaffMembersWithLifecycle(businessId),
      getStaffInvitations(businessId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        staff,
        invitations,
        business: {
          id: authContext.business.id,
          name: authContext.business.name,
          state: authContext.business.state,
          ownerUserId: authContext.business.ownerUserId,
        },
      },
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to load staff list.");
  }
}

/**
 * POST /api/staff - Generate invitation link/QR OR create staff directly
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user, authContext, businessId } = await requireRouteBusinessContext(request, body);
    assertCan(authContext, "STAFF_MANAGE", { businessId });

    const { action = "INVITE", email, fullName, password, origin, customCapabilities } = body;

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
        ownerUser: user,
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

    if (!fullName || !fullName.trim()) {
      return NextResponse.json(
        { success: false, error: "Please provide the name of the staff member to invite." },
        { status: 400 }
      );
    }

    const invitation = await createStaffInvitation({
      ownerUser: user,
      businessId,
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
    return handleRouteError(error, "Failed to process staff request.");
  }
}

/**
 * PATCH /api/staff - Lifecycle status management & Ownership transfer
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { user, authContext, businessId } = await requireRouteBusinessContext(request, body);
    const { action, staffUserId, newStatus, reason, newOwnerUserId, passwordConfirmation, capabilities } = body;

    if (action === "UPDATE_STATUS") {
      assertCan(authContext, "STAFF_MANAGE", { businessId });
      if (!staffUserId || !newStatus) {
        return NextResponse.json({ success: false, error: "Missing staffUserId or newStatus." }, { status: 400 });
      }

      await updateStaffMembershipStatus({
        ownerUser: user,
        businessId,
        staffUserId: Number(staffUserId),
        newStatus,
        reason,
      });

      return NextResponse.json({
        success: true,
        message: `Staff member status updated to ${newStatus}.`,
      });
    }

    if (action === "UPDATE_CAPABILITIES") {
      assertCan(authContext, "STAFF_MANAGE", { businessId });
      if (!staffUserId || !Array.isArray(capabilities)) {
        return NextResponse.json({ success: false, error: "Missing staffUserId or capabilities list." }, { status: 400 });
      }

      await updateStaffCapabilities({
        ownerUser: user,
        businessId,
        staffUserId: Number(staffUserId),
        capabilities,
      });

      return NextResponse.json({
        success: true,
        message: "Staff capabilities updated successfully.",
      });
    }

    if (action === "TRANSFER_OWNERSHIP") {
      assertCan(authContext, "OWNERSHIP_TRANSFER", { businessId });
      if (!newOwnerUserId || !passwordConfirmation) {
        return NextResponse.json(
          { success: false, error: "Please select a successor and enter your password to confirm." },
          { status: 400 }
        );
      }

      await transferBusinessOwnership({
        currentOwner: user,
        businessId,
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
    return handleRouteError(error, "Failed to update staff.");
  }
}

/**
 * DELETE /api/staff - Revoke staff invitation
 */
export async function DELETE(request: Request) {
  try {
    const { user, authContext, businessId } = await requireRouteBusinessContext(request);
    assertCan(authContext, "STAFF_MANAGE", { businessId });

    const { searchParams } = new URL(request.url);
    const invitationId = searchParams.get("invitationId");

    if (!invitationId) {
      return NextResponse.json({ success: false, error: "Missing invitationId." }, { status: 400 });
    }

    const success = await revokeStaffInvitation({
      ownerUser: user,
      businessId,
      invitationId: Number(invitationId),
    });

    if (!success) {
      return NextResponse.json(
        { success: false, error: "Invitation not found or cannot be revoked." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Staff invitation revoked.",
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to revoke invitation.");
  }
}
