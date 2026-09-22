import "dotenv/config";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createUser, createStaffMember } from "./authService";
import { seedBuildingMaterialDemoData } from "./stockService";

async function main() {
  console.log("Seeding demo user, staff member, and authentic building materials data...");

  // 1. Check or create Owner demo user
  const demoEmail = "owner@buildingmaterials.com";
  let [demoUser] = await db.select().from(users).where(eq(users.email, demoEmail)).limit(1);

  if (!demoUser) {
    demoUser = await createUser({
      email: demoEmail,
      password: "password123",
      fullName: "Alhaji Ibrahim Musa",
      role: "OWNER",
      businessName: "Musa Building Materials & Hardware Ltd",
    });
    console.log(`Created demo owner: ${demoEmail} (password: password123)`);
  }

  // 2. Check or create Staff demo user
  const staffEmail = "staff@buildingmaterials.com";
  let [staffUser] = await db.select().from(users).where(eq(users.email, staffEmail)).limit(1);

  if (!staffUser) {
    staffUser = await createStaffMember({
      ownerUser: demoUser,
      email: staffEmail,
      password: "password123",
      fullName: "Musa Aminu (Shop Staff)",
    });
    console.log(`Created demo staff: ${staffEmail} (password: password123)`);
  }

  // 3. Check or create Platform Admin demo user
  const adminEmail = "admin@sispa.io";
  let [adminUser] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

  if (!adminUser) {
    adminUser = await createUser({
      email: adminEmail,
      password: "password123",
      fullName: "SISPA Operations Platform Admin",
      role: "OWNER",
      businessName: "SISPA Platform Operations",
      isPlatformAdmin: true,
    });
    console.log(`Created demo platform admin: ${adminEmail} (password: password123)`);
  }

  await seedBuildingMaterialDemoData(demoUser.id);
  console.log("Seeding complete for demo shop!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
