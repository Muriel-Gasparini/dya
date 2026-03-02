import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Mock readline for checkAndNotify user prompt
vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
  })),
}));

// We need to mock the self-updater module used by checkAndNotify
vi.mock("../../../src/updater/self-updater.js", () => ({
  selfUpdate: vi.fn().mockResolvedValue(undefined),
}));

import {
  loadCheckState,
  saveCheckState,
  checkForUpdate,
  checkAndNotify,
} from "../../../src/updater/version-checker.js";
import type { UpdateCheckState } from "../../../src/updater/types.js";
import { selfUpdate } from "../../../src/updater/self-updater.js";
import { createInterface } from "node:readline/promises";

describe("loadCheckState", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dya-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should return state when file exists and is valid JSON", async () => {
    const state: UpdateCheckState = {
      lastCheckAt: "2026-03-01T15:30:00.000Z",
      latestVersion: "0.2.0",
    };
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "update-check.json"),
      JSON.stringify(state),
    );

    const result = await loadCheckState(tmpDir);
    expect(result).toEqual(state);
  });

  it("should return null when file does not exist (ENOENT)", async () => {
    const result = await loadCheckState(path.join(tmpDir, "nonexistent"));
    expect(result).toBeNull();
  });

  it("should return null when JSON is corrupted", async () => {
    await fs.writeFile(
      path.join(tmpDir, "update-check.json"),
      "not valid json {{{",
    );

    const result = await loadCheckState(tmpDir);
    expect(result).toBeNull();
  });

  it("should return null when cache JSON is missing lastCheckAt field", async () => {
    await fs.writeFile(
      path.join(tmpDir, "update-check.json"),
      JSON.stringify({ latestVersion: "0.2.0" }),
    );

    const result = await loadCheckState(tmpDir);
    expect(result).toBeNull();
  });

  it("should return null when cache JSON is missing latestVersion field", async () => {
    await fs.writeFile(
      path.join(tmpDir, "update-check.json"),
      JSON.stringify({ lastCheckAt: "2026-03-01T15:30:00.000Z" }),
    );

    const result = await loadCheckState(tmpDir);
    expect(result).toBeNull();
  });

  it("should return null when cache JSON has non-string lastCheckAt (number)", async () => {
    await fs.writeFile(
      path.join(tmpDir, "update-check.json"),
      JSON.stringify({ lastCheckAt: 12345, latestVersion: "0.2.0" }),
    );

    const result = await loadCheckState(tmpDir);
    expect(result).toBeNull();
  });

  it("should return null when cache JSON has non-string latestVersion (number)", async () => {
    await fs.writeFile(
      path.join(tmpDir, "update-check.json"),
      JSON.stringify({ lastCheckAt: "2026-03-01T15:30:00.000Z", latestVersion: 200 }),
    );

    const result = await loadCheckState(tmpDir);
    expect(result).toBeNull();
  });

  it("should return null when cache JSON has null fields", async () => {
    await fs.writeFile(
      path.join(tmpDir, "update-check.json"),
      JSON.stringify({ lastCheckAt: null, latestVersion: null }),
    );

    const result = await loadCheckState(tmpDir);
    expect(result).toBeNull();
  });

  it("should create directory and return null if directory does not exist", async () => {
    const nestedDir = path.join(tmpDir, "deep", "nested", "config");
    const result = await loadCheckState(nestedDir);
    expect(result).toBeNull();

    // Directory should now exist
    const stat = await fs.stat(nestedDir);
    expect(stat.isDirectory()).toBe(true);
  });
});

describe("saveCheckState", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dya-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should save state as JSON", async () => {
    const state: UpdateCheckState = {
      lastCheckAt: "2026-03-01T15:30:00.000Z",
      latestVersion: "0.2.0",
    };

    await saveCheckState(tmpDir, state);

    const content = await fs.readFile(
      path.join(tmpDir, "update-check.json"),
      "utf-8",
    );
    expect(JSON.parse(content)).toEqual(state);
  });

  it("should create directory if it does not exist", async () => {
    const nestedDir = path.join(tmpDir, "deep", "config");
    const state: UpdateCheckState = {
      lastCheckAt: "2026-03-01T15:30:00.000Z",
      latestVersion: "0.2.0",
    };

    await saveCheckState(nestedDir, state);

    const content = await fs.readFile(
      path.join(nestedDir, "update-check.json"),
      "utf-8",
    );
    expect(JSON.parse(content)).toEqual(state);
  });
});

describe("checkForUpdate", () => {
  let tmpDir: string;
  const originalFetch = globalThis.fetch;
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dya-test-"));
    Object.defineProperty(process, "platform", { value: "linux" });
    Object.defineProperty(process, "arch", { value: "x64" });
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(process, "platform", { value: originalPlatform });
    Object.defineProperty(process, "arch", { value: originalArch });
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function mockGitHubRelease(
    tagName: string,
    assets: Array<{ name: string; browser_download_url: string }>,
  ) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tag_name: tagName,
          prerelease: false,
          assets,
        }),
    });
  }

  it("should return cached result when cache is valid (< 24h)", async () => {
    const state: UpdateCheckState = {
      lastCheckAt: new Date().toISOString(), // just now
      latestVersion: "0.2.0",
    };
    await fs.writeFile(
      path.join(tmpDir, "update-check.json"),
      JSON.stringify(state),
    );

    globalThis.fetch = vi.fn();

    const result = await checkForUpdate({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(result).not.toBeNull();
    expect(result!.updateAvailable).toBe(true);
    expect(result!.latestVersion).toBe("0.2.0");
    expect(result!.currentVersion).toBe("0.1.0");
    // No HTTP request should have been made
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("should make HTTP request when cache is expired", async () => {
    const expiredDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
    const state: UpdateCheckState = {
      lastCheckAt: expiredDate.toISOString(),
      latestVersion: "0.1.0",
    };
    await fs.writeFile(
      path.join(tmpDir, "update-check.json"),
      JSON.stringify(state),
    );

    mockGitHubRelease("v0.2.0", [
      {
        name: "dya-linux-x64.tar.gz",
        browser_download_url:
          "https://github.com/Muriel-Gasparini/dya/releases/download/v0.2.0/dya-linux-x64.tar.gz",
      },
    ]);

    const result = await checkForUpdate({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(result).not.toBeNull();
    expect(result!.updateAvailable).toBe(true);
    expect(result!.latestVersion).toBe("0.2.0");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("should make HTTP request when cache does not exist", async () => {
    mockGitHubRelease("v0.2.0", [
      {
        name: "dya-linux-x64.tar.gz",
        browser_download_url:
          "https://github.com/Muriel-Gasparini/dya/releases/download/v0.2.0/dya-linux-x64.tar.gz",
      },
    ]);

    const result = await checkForUpdate({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(result).not.toBeNull();
    expect(result!.updateAvailable).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("should return updateAvailable: true with correct downloadUrl when new version exists", async () => {
    mockGitHubRelease("v0.3.0", [
      {
        name: "dya-linux-x64.tar.gz",
        browser_download_url:
          "https://github.com/Muriel-Gasparini/dya/releases/download/v0.3.0/dya-linux-x64.tar.gz",
      },
      {
        name: "dya-darwin-arm64.tar.gz",
        browser_download_url:
          "https://github.com/Muriel-Gasparini/dya/releases/download/v0.3.0/dya-darwin-arm64.tar.gz",
      },
    ]);

    const result = await checkForUpdate({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(result).toEqual({
      updateAvailable: true,
      latestVersion: "0.3.0",
      currentVersion: "0.1.0",
      downloadUrl:
        "https://github.com/Muriel-Gasparini/dya/releases/download/v0.3.0/dya-linux-x64.tar.gz",
    });
  });

  it("should return updateAvailable: false when same version", async () => {
    mockGitHubRelease("v0.1.0", [
      {
        name: "dya-linux-x64.tar.gz",
        browser_download_url: "https://example.com/dya-linux-x64.tar.gz",
      },
    ]);

    const result = await checkForUpdate({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(result).not.toBeNull();
    expect(result!.updateAvailable).toBe(false);
  });

  it("should return updateAvailable: false when remote version is older", async () => {
    mockGitHubRelease("v0.0.9", [
      {
        name: "dya-linux-x64.tar.gz",
        browser_download_url: "https://example.com/dya-linux-x64.tar.gz",
      },
    ]);

    const result = await checkForUpdate({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(result).not.toBeNull();
    expect(result!.updateAvailable).toBe(false);
  });

  it("should return null on fetch timeout", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new DOMException("Aborted", "AbortError"));

    const result = await checkForUpdate({
      currentVersion: "0.1.0",
      configDir: tmpDir,
      timeoutMs: 100,
    });

    expect(result).toBeNull();
  });

  it("should return null on network error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    const result = await checkForUpdate({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(result).toBeNull();
  });

  it("should return null on GitHub 403 (rate limit)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    const result = await checkForUpdate({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(result).toBeNull();
  });

  it("should return downloadUrl null when no asset for current platform", async () => {
    mockGitHubRelease("v0.2.0", [
      {
        name: "dya-darwin-arm64.tar.gz",
        browser_download_url: "https://example.com/dya-darwin-arm64.tar.gz",
      },
    ]);

    const result = await checkForUpdate({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(result).not.toBeNull();
    expect(result!.updateAvailable).toBe(true);
    expect(result!.downloadUrl).toBeNull();
  });

  it("should handle tag_name without 'v' prefix", async () => {
    mockGitHubRelease("0.2.0", [
      {
        name: "dya-linux-x64.tar.gz",
        browser_download_url: "https://example.com/dya-linux-x64.tar.gz",
      },
    ]);

    const result = await checkForUpdate({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(result).not.toBeNull();
    expect(result!.latestVersion).toBe("0.2.0");
    expect(result!.updateAvailable).toBe(true);
  });

  it("should update cache after successful check", async () => {
    mockGitHubRelease("v0.2.0", [
      {
        name: "dya-linux-x64.tar.gz",
        browser_download_url: "https://example.com/dya-linux-x64.tar.gz",
      },
    ]);

    await checkForUpdate({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    const cacheContent = await fs.readFile(
      path.join(tmpDir, "update-check.json"),
      "utf-8",
    );
    const cache = JSON.parse(cacheContent);
    expect(cache.latestVersion).toBe("0.2.0");
    expect(cache.lastCheckAt).toBeDefined();
  });

  it("should use custom checkIntervalMs", async () => {
    // Cache that is 1 second old
    const state: UpdateCheckState = {
      lastCheckAt: new Date(Date.now() - 1000).toISOString(),
      latestVersion: "0.2.0",
    };
    await fs.writeFile(
      path.join(tmpDir, "update-check.json"),
      JSON.stringify(state),
    );

    mockGitHubRelease("v0.3.0", [
      {
        name: "dya-linux-x64.tar.gz",
        browser_download_url: "https://example.com/dya-linux-x64.tar.gz",
      },
    ]);

    // With checkIntervalMs: 0, should always fetch
    const result = await checkForUpdate({
      currentVersion: "0.1.0",
      configDir: tmpDir,
      checkIntervalMs: 0,
    });

    expect(result).not.toBeNull();
    expect(result!.latestVersion).toBe("0.3.0");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("should return null on non-ok HTTP response (e.g. 404)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const result = await checkForUpdate({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(result).toBeNull();
  });
});

describe("checkAndNotify", () => {
  let tmpDir: string;
  const originalFetch = globalThis.fetch;
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dya-test-"));
    vi.clearAllMocks();
    Object.defineProperty(process, "platform", { value: "linux" });
    Object.defineProperty(process, "arch", { value: "x64" });
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(process, "platform", { value: originalPlatform });
    Object.defineProperty(process, "arch", { value: originalArch });
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function mockGitHubRelease(
    tagName: string,
    assets: Array<{ name: string; browser_download_url: string }>,
  ) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tag_name: tagName,
          prerelease: false,
          assets,
        }),
    });
  }

  it("should call selfUpdate when update is available and user confirms", async () => {
    mockGitHubRelease("v0.2.0", [
      {
        name: "dya-linux-x64.tar.gz",
        browser_download_url:
          "https://github.com/Muriel-Gasparini/dya/releases/download/v0.2.0/dya-linux-x64.tar.gz",
      },
    ]);

    const mockRl = {
      question: vi.fn().mockResolvedValue("y"),
      close: vi.fn(),
    };
    vi.mocked(createInterface).mockReturnValue(mockRl as any);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await checkAndNotify({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(selfUpdate).toHaveBeenCalledWith({
      downloadUrl:
        "https://github.com/Muriel-Gasparini/dya/releases/download/v0.2.0/dya-linux-x64.tar.gz",
      targetPath: process.execPath,
      targetVersion: "0.2.0",
    });

    consoleSpy.mockRestore();
  });

  it("should not call selfUpdate when user declines", async () => {
    mockGitHubRelease("v0.2.0", [
      {
        name: "dya-linux-x64.tar.gz",
        browser_download_url: "https://example.com/dya-linux-x64.tar.gz",
      },
    ]);

    const mockRl = {
      question: vi.fn().mockResolvedValue("n"),
      close: vi.fn(),
    };
    vi.mocked(createInterface).mockReturnValue(mockRl as any);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await checkAndNotify({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(selfUpdate).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("should be silent when no update is available", async () => {
    mockGitHubRelease("v0.1.0", [
      {
        name: "dya-linux-x64.tar.gz",
        browser_download_url: "https://example.com/dya-linux-x64.tar.gz",
      },
    ]);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await checkAndNotify({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(selfUpdate).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("should be silent on check error (offline)", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleErrSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await checkAndNotify({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(selfUpdate).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleErrSpy.mockRestore();
  });

  it("should be silent when selfUpdate throws an error (e.g. download failure)", async () => {
    mockGitHubRelease("v0.2.0", [
      {
        name: "dya-linux-x64.tar.gz",
        browser_download_url:
          "https://github.com/Muriel-Gasparini/dya/releases/download/v0.2.0/dya-linux-x64.tar.gz",
      },
    ]);

    const mockRl = {
      question: vi.fn().mockResolvedValue("y"),
      close: vi.fn(),
    };
    vi.mocked(createInterface).mockReturnValue(mockRl as any);
    vi.mocked(selfUpdate).mockRejectedValue(new Error("Download failed: Network error"));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Should not throw -- checkAndNotify catches all errors silently
    await checkAndNotify({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(selfUpdate).toHaveBeenCalled();
    // Should not crash or throw

    consoleSpy.mockRestore();
    consoleErrSpy.mockRestore();
  });

  it("should show alternative message when downloadUrl is null", async () => {
    mockGitHubRelease("v0.2.0", [
      {
        name: "dya-darwin-arm64.tar.gz",
        browser_download_url: "https://example.com/dya-darwin-arm64.tar.gz",
      },
    ]);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await checkAndNotify({
      currentVersion: "0.1.0",
      configDir: tmpDir,
    });

    expect(selfUpdate).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("no binary for your platform"),
    );

    consoleSpy.mockRestore();
  });
});
