import { NextResponse } from "next/server";
import { ActiveBusinessRequiredError } from "./authService";
import { ConflictError, NotFoundError, ValidationError } from "./openingStock";

export function handleRouteError(
  error: any,
  fallbackMessage: string = "Operation failed."
) {
  if (error instanceof ActiveBusinessRequiredError) {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message },
      { status: 400 }
    );
  }

  if (error instanceof ValidationError) {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message },
      { status: 400 }
    );
  }

  if (error instanceof NotFoundError) {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message },
      { status: 404 }
    );
  }

  if (error instanceof ConflictError) {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message },
      { status: 409 }
    );
  }

  const msg: string = typeof error?.message === "string" ? error.message : "";

  if (msg === "UNAUTHORIZED") {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED", error: "Please log in." },
      { status: 401 }
    );
  }

  if (msg === "INVALID_CREDENTIALS") {
    return NextResponse.json(
      { success: false, code: "INVALID_CREDENTIALS", error: "Invalid credentials." },
      { status: 401 }
    );
  }

  if (
    msg.startsWith("FORBIDDEN_") ||
    msg === "STAFF_SUSPENDED" ||
    msg === "STAFF_DEACTIVATED" ||
    msg === "MEMBERSHIP_NOT_ACTIVE" ||
    msg.startsWith("BUSINESS_") && msg !== "BUSINESS_NOT_FOUND"
  ) {
    return NextResponse.json(
      { success: false, code: msg, error: "Access denied for this business or action." },
      { status: 403 }
    );
  }

  if (msg === "CANNOT_MODIFY_OWN_MEMBERSHIP") {
    return NextResponse.json(
      { success: false, code: msg, error: "You cannot modify your own membership status." },
      { status: 400 }
    );
  }

  if (
    msg === "BUSINESS_NOT_FOUND" ||
    msg === "STAFF_MEMBERSHIP_NOT_FOUND" ||
    msg.endsWith("_NOT_FOUND")
  ) {
    return NextResponse.json(
      { success: false, code: msg || "NOT_FOUND", error: msg },
      { status: 404 }
    );
  }

  if (msg.includes("PRODUCT_HAS_HISTORY")) {
    return NextResponse.json(
      { success: false, code: "PRODUCT_HAS_HISTORY", error: msg },
      { status: 409 }
    );
  }

  if (msg === "NEW_OWNER_NOT_ACTIVE" || msg === "NEW_OWNER_NOT_ACTIVE_MEMBER") {
    return NextResponse.json(
      { success: false, code: msg, error: "Selected user is not an active member of this business." },
      { status: 400 }
    );
  }

  console.error(fallbackMessage, error);
  return NextResponse.json(
    { success: false, error: msg || fallbackMessage },
    { status: 500 }
  );
}
