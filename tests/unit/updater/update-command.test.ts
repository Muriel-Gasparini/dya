import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as childProcess from "node:child_process";

// We need a mutable homedir value so version-checker uses our temp dir
let fakeHomeDir = os.tmpdir();

// Mock node:os to redirect homedir to our temp dir
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    default: {
      ...actual,
      homedir: () => fakeHomeDir,
    },
    homedir: () => fakeHomeDir,
  };
});

// Mock ONLY external dependencies:
// 1. child_process.execFile (system command execution)
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { updateCommand } from "../../../src/updater/update-command.js";
import { getAssetName } from "../../../src/updater/types.js";

const EXTRACTED_BIN = getAssetName().replace(/\.tar\.gz$/, "");

describe("updateCommand", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let tmpDir: string;
  let fakeExecPath: string;
  const originalFetch = globalThis.fetch;
  const originalExecPath = process.execPath;
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "update-cmd-test-"));

    // Redirect os.homedir to temp dir so checkForUpdate's cache goes to tmpDir/.config/dya
    fakeHomeDir = tmpDir;

    // Create a fake binary at the fake exec path
    fakeExecPath = path.join(tmpDir, "dya");
    await fs.writeFile(fakeExecPath, "old-binary");
    Object.defineProperty(process, "execPath", {
      value: fakeExecPath,
      writable: true,
      configurable: true,
    });

    // Ensure consistent platform/arch for asset name matching
    Object.defineProperty(process, "platform", {
      value: "linux",
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process, "arch", {
      value: "x64",
      writable: true,
      configurable: true,
    });

    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(process, "execPath", {
      value: originalExecPath,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process, "arch", {
      value: originalArch,
      writable: true,
      configurable: true,
    });
    consoleSpy?.mockRestore();
    consoleErrSpy?.mockRestore();
    processExitSpy?.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper: mock globalThis.fetch to return a GitHub API response
   * followed by a download response (for selfUpdate).
   */
  function mockFetchForUpdate(
    latestVersion: string,
    assetName: string = `dya-linux-x64.tar.gz`,
  ) {
    const apiUrl = `https://api.github.com/repos/Muriel-Gasparini/dya/releases/latest`;
    const downloadUrl = `https://github.com/Muriel-Gasparini/dya/releases/download/v${latestVersion}/${assetName}`;

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === apiUrl || url.includes("api.github.com")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tag_name: `v${latestVersion}`,
              assets: [
                {
                  name: assetName,
                  browser_download_url: downloadUrl,
                },
              ],
            }),
        });
      }
      // Download URL -- return fake tar.gz content
      return Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () =>
          Promise.resolve(
            Buffer.from("fake-tarball-content").buffer.slice(0),
          ),
      });
    });
  }

  /**
   * Helper: mock globalThis.fetch to return "already on latest"
   */
  function mockFetchNoUpdate(currentVersion: string) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tag_name: `v${currentVersion}`,
          assets: [
            {
              name: `dya-linux-x64.tar.gz`,
              browser_download_url: `https://example.com/dya-linux-x64.tar.gz`,
            },
          ],
        }),
    });
  }

  /**
   * Helper: mock execFile to simulate successful tar extraction.
   */
  function mockExecFileSuccess() {
    vi.mocked(childProcess.execFile).mockImplementation(
      (_cmd: string, _args: any, _opts: any, callback: any) => {
        if (typeof _args?.[0] === "string" && _args[0] === "xzf") {
          const cIndex = (_args as string[]).indexOf("-C");
          if (cIndex !== -1) {
            const extractDir = _args[cIndex + 1];
            fs.mkdir(extractDir, { recursive: true }).then(() => {
              fs.writeFile(
                path.join(extractDir, EXTRACTED_BIN),
                "new-binary-content",
              ).then(() => {
                callback(null, "", "");
              });
            });
          } else {
            callback(null, "", "");
          }
        } else {
          callback(null, "", "");
        }
        return {} as any;
      },
    );
  }

  it("should call selfUpdate without confirmation when update is available", async () => {
    mockFetchForUpdate("99.0.0");
    mockExecFileSuccess();

    await updateCommand();

    expect(consoleSpy).toHaveBeenCalledWith("Checking for updates...");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("New version v99.0.0 found"),
    );
    // selfUpdate should have been called (via real code path):
    // - fetch was called for download
    // - tar was called for extraction
    expect(childProcess.execFile).toHaveBeenCalled();
    const tarCall = vi.mocked(childProcess.execFile).mock.calls[0];
    expect(tarCall[0]).toBe("tar");
    // Binary should have been updated
    const content = await fs.readFile(fakeExecPath, "utf-8");
    expect(content).toBe("new-binary-content");
    // Success message from selfUpdate
    expect(consoleSpy).toHaveBeenCalledWith("Updated to v99.0.0");
  });

  it("should show message when already on latest version", async () => {
    // Use a version that matches pkg.version so updateAvailable is false.
    // We need to read the actual pkg.version the code uses.
    // Since updateCommand imports pkg.version, we mock fetch to return that same version.
    // The simplest approach: return a very old version that is NOT newer.
    // Actually, we need to return the SAME version as pkg.version.
    // Let's read package.json to know what version it is.
    const pkgContent = await fs.readFile(
      path.join(process.cwd(), "package.json"),
      "utf-8",
    );
    const pkgVersion = JSON.parse(pkgContent).version;

    mockFetchNoUpdate(pkgVersion);

    await updateCommand();

    expect(consoleSpy).toHaveBeenCalledWith(
      `You are already on the latest version (v${pkgVersion})`,
    );
    expect(childProcess.execFile).not.toHaveBeenCalled();
  });

  it("should show error message when offline (fetch fails)", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    await updateCommand();

    expect(consoleSpy).toHaveBeenCalledWith(
      "Could not check for updates. Check your connection.",
    );
    expect(childProcess.execFile).not.toHaveBeenCalled();
  });

  it("should show message when downloadUrl is null (no binary for platform)", async () => {
    // Return an asset for a different platform
    const apiUrl = `https://api.github.com/repos/Muriel-Gasparini/dya/releases/latest`;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tag_name: "v99.0.0",
          assets: [
            {
              name: "dya-darwin-arm64.tar.gz",
              browser_download_url:
                "https://example.com/dya-darwin-arm64.tar.gz",
            },
          ],
        }),
    });

    await updateCommand();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("no binary for your platform"),
    );
    expect(childProcess.execFile).not.toHaveBeenCalled();
  });

  it("should show error and exit 1 when selfUpdate fails (download error)", async () => {
    // First call (GitHub API) succeeds, second call (download) fails
    const apiUrl = `https://api.github.com/repos/Muriel-Gasparini/dya/releases/latest`;
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes("api.github.com")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tag_name: "v99.0.0",
              assets: [
                {
                  name: "dya-linux-x64.tar.gz",
                  browser_download_url:
                    "https://example.com/dya-linux-x64.tar.gz",
                },
              ],
            }),
        });
      }
      // Download fails
      return Promise.reject(new Error("Network error during download"));
    });

    await updateCommand();

    expect(consoleErrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Download failed"),
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("should call checkForUpdate with checkIntervalMs: 0 to ignore cache", async () => {
    // This is verified by the fact that even with a recent cache, fetch is still called
    const configDir = path.join(tmpDir, ".config", "dya");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, "update-check.json"),
      JSON.stringify({
        lastCheckAt: new Date().toISOString(),
        latestVersion: "0.0.1",
      }),
    );

    // Mock fetch to return a newer version
    mockFetchForUpdate("99.0.0");
    mockExecFileSuccess();

    await updateCommand();

    // Despite the cache being fresh, fetch should have been called
    // (because checkIntervalMs: 0 ignores cache)
    expect(globalThis.fetch).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("New version v99.0.0 found"),
    );
  });

  it("should show error and exit 1 when tar extraction fails", async () => {
    mockFetchForUpdate("99.0.0");

    vi.mocked(childProcess.execFile).mockImplementation(
      (_cmd: string, _args: any, _opts: any, callback: any) => {
        callback(new Error("tar: Error is not recoverable"), "", "");
        return {} as any;
      },
    );

    await updateCommand();

    expect(consoleErrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to extract"),
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
