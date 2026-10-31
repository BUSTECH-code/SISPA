import { describe, it, expect } from "vitest";
import { getDaysRemainingBadgeStyle } from "./stockDisplay";
import { DaysRemainingTier } from "@/domain/intelligence";

describe("getDaysRemainingBadgeStyle", () => {
  it("provides distinctive, accessible Tailwind styles for DISCREPANCY tier", () => {
    const style = getDaysRemainingBadgeStyle("DISCREPANCY");
    expect(style.textClasses).toContain("text-red");
    expect(style.badgeClasses).toContain("bg-red");
  });

  it("provides strong red styling for OUT_OF_STOCK tier", () => {
    const style = getDaysRemainingBadgeStyle("OUT_OF_STOCK");
    expect(style.textClasses).toContain("text-red");
    expect(style.badgeClasses).toContain("bg-red");
  });

  it("provides urgent amber/red styling for CRITICAL tier", () => {
    const style = getDaysRemainingBadgeStyle("CRITICAL");
    expect(style.textClasses).toContain("amber");
    expect(style.badgeClasses).toContain("amber");
  });

  it("provides warning amber styling for LOW tier", () => {
    const style = getDaysRemainingBadgeStyle("LOW");
    expect(style.textClasses).toContain("amber");
    expect(style.badgeClasses).toContain("amber");
  });

  it("provides calm neutral styling for NORMAL tier", () => {
    const style = getDaysRemainingBadgeStyle("NORMAL");
    expect(style.textClasses).toContain("slate");
  });

  it("provides neutral styling for NO_SALES tier", () => {
    const style = getDaysRemainingBadgeStyle("NO_SALES");
    expect(style.textClasses).toContain("slate");
  });

  it("provides neutral muted styling for NO_ESTIMATE tier", () => {
    const style = getDaysRemainingBadgeStyle("NO_ESTIMATE");
    expect(style.textClasses).toContain("slate");
  });
});
