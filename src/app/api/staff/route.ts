import { NextResponse } from "next/server";
import { getStaffMembers, createStaffMember, requireOwner } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const owner = await requireOwner();
    const staff = await getStaffMembers(owner.id);

    return NextResponse.json({
      success: true,
      data: staff,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    if (error.message === "FORBIDDEN_OWNER_ONLY") {
      return NextResponse.json({ success: false, error: "Only the shop owner can view staff accounts." }, { status: 403 });
    }
    console.error("Failed to list staff:", error);
    return NextResponse.json({ success: false, error: "Failed to load staff list." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    const body = await request.json();
    const { email, password, fullName } = body;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ success: false, error: "Enter a valid email address for the staff member." }, { status: 400 });
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
        businessName: newStaff.businessName,
      },
      message: `Staff account created for ${newStaff.fullName}. They can now sign in on their phone.`,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    if (error.message === "FORBIDDEN_OWNER_ONLY") {
      return NextResponse.json({ success: false, error: "Only the shop owner can create staff accounts." }, { status: 403 });
    }
    console.error("Failed to create staff:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to create staff account." }, { status: 400 });
  }
}
