import { describe, it, expect } from "vitest";
import { POST as demoLoginPost } from "@/app/api/auth/demo-login/route";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE_NAME } from "@/server/authService";

describe("Demo Login & Session Verification Tests", () => {
  it("Owner demo login creates valid database session and returns Set-Cookie header", async () => {
    const req = new Request("http://localhost/api/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "OWNER" }),
    });

    const res = await demoLoginPost(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.user.email).toBe("owner@buildingmaterials.com");
    expect(json.user.role).toBe("OWNER");
    expect(json.user.isPlatformAdmin).toBe(false);

    // Verify Set-Cookie header is set
    const cookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/");

    // Verify session row actually exists in database
    const [sessionInDb] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, cookie!.value))
      .limit(1);

    expect(sessionInDb).toBeDefined();
    expect(sessionInDb.userId).toBe(json.user.id);
  });

  it("Staff demo login creates valid database session and returns Set-Cookie header", async () => {
    const req = new Request("http://localhost/api/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "STAFF" }),
    });

    const res = await demoLoginPost(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.user.email).toBe("staff@buildingmaterials.com");
    expect(json.user.role).toBe("STAFF");
    expect(json.user.isPlatformAdmin).toBe(false);

    const cookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBeTruthy();

    const [sessionInDb] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, cookie!.value))
      .limit(1);

    expect(sessionInDb).toBeDefined();
    expect(sessionInDb.userId).toBe(json.user.id);
  });

  it("Platform Admin demo login creates valid database session and returns Set-Cookie header", async () => {
    const req = new Request("http://localhost/api/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "PLATFORM_ADMIN" }),
    });

    const res = await demoLoginPost(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.user.email).toBe("admin@sispa.io");
    expect(json.user.isPlatformAdmin).toBe(true);

    const cookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBeTruthy();

    const [sessionInDb] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, cookie!.value))
      .limit(1);

    expect(sessionInDb).toBeDefined();
    expect(sessionInDb.userId).toBe(json.user.id);
  });
});
