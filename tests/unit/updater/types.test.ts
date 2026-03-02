import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getAssetName, compareVersions } from "../../../src/updater/types.js";

describe("getAssetName", () => {
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    Object.defineProperty(process, "arch", { value: originalArch });
  });

  it("should return correct name for linux-x64", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    Object.defineProperty(process, "arch", { value: "x64" });
    expect(getAssetName()).toBe("dya-linux-x64.tar.gz");
  });

  it("should return correct name for darwin-arm64", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    Object.defineProperty(process, "arch", { value: "arm64" });
    expect(getAssetName()).toBe("dya-darwin-arm64.tar.gz");
  });

  it("should return correct name for linux-arm64", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    Object.defineProperty(process, "arch", { value: "arm64" });
    expect(getAssetName()).toBe("dya-linux-arm64.tar.gz");
  });

  it("should return correct name for darwin-x64", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    Object.defineProperty(process, "arch", { value: "x64" });
    expect(getAssetName()).toBe("dya-darwin-x64.tar.gz");
  });
});

describe("compareVersions", () => {
  it("should return 1 when a > b (minor bump)", () => {
    expect(compareVersions("0.2.0", "0.1.0")).toBe(1);
  });

  it("should return -1 when a < b (minor bump)", () => {
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
  });

  it("should return 0 when versions are equal", () => {
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
  });

  it("should return 1 when a > b (major bump)", () => {
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
  });

  it("should return 1 when a > b (patch bump)", () => {
    expect(compareVersions("0.1.1", "0.1.0")).toBe(1);
  });

  it("should return -1 when a < b (major)", () => {
    expect(compareVersions("0.9.9", "1.0.0")).toBe(-1);
  });

  it("should handle large version numbers", () => {
    expect(compareVersions("10.20.30", "10.20.29")).toBe(1);
    expect(compareVersions("10.20.30", "10.20.30")).toBe(0);
    expect(compareVersions("10.20.30", "10.20.31")).toBe(-1);
  });

  it("should compare numerically, not lexicographically", () => {
    // "9" > "10" lexicographically, but 9 < 10 numerically
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
  });

  it("should handle pre-release tags by stripping suffix (a > b)", () => {
    expect(compareVersions("0.2.0-beta.1", "0.1.0")).toBe(1);
  });

  it("should handle pre-release tags by stripping suffix (a < b)", () => {
    expect(compareVersions("0.1.0-rc.1", "0.2.0")).toBe(-1);
  });

  it("should handle pre-release tags on both sides (equal base versions)", () => {
    expect(compareVersions("0.2.0-beta.1", "0.2.0-rc.2")).toBe(0);
  });

  it("should handle pre-release tag with no patch version", () => {
    expect(compareVersions("1.0.0-alpha", "0.9.9")).toBe(1);
  });

  it("should return 0 for non-semver input with same numeric prefix", () => {
    // Edge case: garbage input should not crash
    expect(compareVersions("abc", "def")).toBe(0);
  });
});
