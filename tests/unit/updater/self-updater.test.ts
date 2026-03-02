import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as childProcess from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { selfUpdate } from "../../../src/updater/self-updater.js";

describe("selfUpdate", () => {
  let tmpDir: string;
  let targetPath: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dya-update-test-"));
    targetPath = path.join(tmpDir, "dya");
    // Create a fake current binary
    await fs.writeFile(targetPath, "old-binary-content");
    vi.clearAllMocks();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function mockFetchSuccess(content: Buffer = Buffer.from("tarball-content")) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)),
    });
  }

  function mockExecFileSuccess() {
    vi.mocked(childProcess.execFile).mockImplementation(
      (_cmd: string, _args: any, _opts: any, callback: any) => {
        // When tar is called, create the expected extracted file
        // The extracted file should be "dya" in the temp extraction dir
        if (typeof _args?.[0] === "string" && _args[0] === "xzf") {
          // Find the -C argument to know the extraction dir
          const cIndex = _args.indexOf("-C");
          if (cIndex !== -1) {
            const extractDir = _args[cIndex + 1];
            // Create a fake extracted binary
            fs.mkdir(extractDir, { recursive: true }).then(() => {
              fs.writeFile(path.join(extractDir, "dya"), "new-binary-content").then(() => {
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

  function mockExecFileFail(errorMessage: string) {
    vi.mocked(childProcess.execFile).mockImplementation(
      (_cmd: string, _args: any, _opts: any, callback: any) => {
        callback(new Error(errorMessage), "", "");
        return {} as any;
      },
    );
  }

  it("should download, extract, and replace binary on happy path", async () => {
    mockFetchSuccess();
    mockExecFileSuccess();

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await selfUpdate({
      downloadUrl: "https://example.com/dya-linux-x64.tar.gz",
      targetPath,
      targetVersion: "0.2.0",
    });

    // Verify fetch was called with the download URL
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.com/dya-linux-x64.tar.gz",
    );

    // Verify tar was called
    expect(childProcess.execFile).toHaveBeenCalled();
    const tarCall = vi.mocked(childProcess.execFile).mock.calls[0];
    expect(tarCall[0]).toBe("tar");
    expect(tarCall[1]).toContain("xzf");

    // Verify the binary was replaced (renamed)
    const content = await fs.readFile(targetPath, "utf-8");
    expect(content).toBe("new-binary-content");

    // Verify success message
    expect(consoleSpy).toHaveBeenCalledWith("Updated to v0.2.0");

    consoleSpy.mockRestore();
  });

  it("should set chmod 0o755 on the binary", async () => {
    mockFetchSuccess();
    mockExecFileSuccess();

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await selfUpdate({
      downloadUrl: "https://example.com/dya-linux-x64.tar.gz",
      targetPath,
      targetVersion: "0.2.0",
    });

    const stat = await fs.stat(targetPath);
    // Check executable bits are set (0o755 = rwxr-xr-x)
    expect(stat.mode & 0o755).toBe(0o755);

    consoleSpy.mockRestore();
  });

  it("should clean up temporary files after success", async () => {
    mockFetchSuccess();
    mockExecFileSuccess();

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await selfUpdate({
      downloadUrl: "https://example.com/dya-linux-x64.tar.gz",
      targetPath,
      targetVersion: "0.2.0",
    });

    // Temporary tar.gz should not exist
    const tmpTar = targetPath + ".update.tar.gz";
    await expect(fs.access(tmpTar)).rejects.toThrow();

    // Temporary binary should not exist
    const tmpBin = targetPath + ".update.tmp";
    await expect(fs.access(tmpBin)).rejects.toThrow();

    consoleSpy.mockRestore();
  });

  it("should throw on download failure (fetch error)", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("Network error"));

    await expect(
      selfUpdate({
        downloadUrl: "https://example.com/dya-linux-x64.tar.gz",
        targetPath,
        targetVersion: "0.2.0",
      }),
    ).rejects.toThrow("Download failed");
  });

  it("should throw on non-200 HTTP response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(
      selfUpdate({
        downloadUrl: "https://example.com/dya-linux-x64.tar.gz",
        targetPath,
        targetVersion: "0.2.0",
      }),
    ).rejects.toThrow("Download failed");
  });

  it("should throw on tar extraction failure", async () => {
    mockFetchSuccess();
    mockExecFileFail("tar: Error is not recoverable");

    await expect(
      selfUpdate({
        downloadUrl: "https://example.com/dya-linux-x64.tar.gz",
        targetPath,
        targetVersion: "0.2.0",
      }),
    ).rejects.toThrow("Failed to extract package");
  });

  it("should throw on permission denied (EACCES on rename)", async () => {
    mockFetchSuccess();

    // Mock execFile to create the extracted file, but make the target dir read-only
    vi.mocked(childProcess.execFile).mockImplementation(
      (_cmd: string, _args: any, _opts: any, callback: any) => {
        if (typeof _args?.[0] === "string" && _args[0] === "xzf") {
          const cIndex = _args.indexOf("-C");
          if (cIndex !== -1) {
            const extractDir = _args[cIndex + 1];
            fs.mkdir(extractDir, { recursive: true }).then(() => {
              fs.writeFile(path.join(extractDir, "dya"), "new-binary").then(() => {
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

    // Use a target path in a read-only directory
    const readOnlyDir = path.join(tmpDir, "readonly");
    await fs.mkdir(readOnlyDir);
    const readOnlyTarget = path.join(readOnlyDir, "dya");
    await fs.writeFile(readOnlyTarget, "old");
    await fs.chmod(readOnlyDir, 0o444);

    try {
      await expect(
        selfUpdate({
          downloadUrl: "https://example.com/dya-linux-x64.tar.gz",
          targetPath: readOnlyTarget,
          targetVersion: "0.2.0",
        }),
      ).rejects.toThrow();
    } finally {
      // Restore permissions for cleanup
      await fs.chmod(readOnlyDir, 0o755);
    }
  });

  it("should clean up temporary files even on error", async () => {
    mockFetchSuccess();
    mockExecFileFail("tar failed");

    try {
      await selfUpdate({
        downloadUrl: "https://example.com/dya-linux-x64.tar.gz",
        targetPath,
        targetVersion: "0.2.0",
      });
    } catch {
      // Expected error
    }

    // Temporary tar.gz should not exist
    const tmpTar = targetPath + ".update.tar.gz";
    await expect(fs.access(tmpTar)).rejects.toThrow();
  });
});
