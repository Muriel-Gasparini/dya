import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";

// Mock both child_process and fs/promises at module level
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// We need real fs for setup, but mock writeFile for ENOSPC
const realFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
const mockWriteFile = vi.fn();

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    writeFile: (...args: Parameters<typeof actual.writeFile>) => mockWriteFile(...args),
  };
});

import { selfUpdate } from "../../../src/updater/self-updater.js";

describe("selfUpdate ENOSPC handling", () => {
  let tmpDir: string;
  let targetPath: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    tmpDir = await realFs.mkdtemp(path.join(os.tmpdir(), "dya-enospc-test-"));
    targetPath = path.join(tmpDir, "dya");
    await realFs.writeFile(targetPath, "old-binary-content");
    vi.clearAllMocks();

    // Default: delegate to real fs
    mockWriteFile.mockImplementation((...args: Parameters<typeof realFs.writeFile>) =>
      realFs.writeFile(...args),
    );
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await realFs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should throw 'Disk full' error when writeFile fails with ENOSPC", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(Buffer.from("tarball").buffer),
    });

    // Mock writeFile to throw ENOSPC for the tar.gz file
    mockWriteFile.mockImplementation(async (filePath: string) => {
      if (typeof filePath === "string" && filePath.endsWith(".update.tar.gz")) {
        const err = new Error("ENOSPC: no space left on device") as NodeJS.ErrnoException;
        err.code = "ENOSPC";
        throw err;
      }
      return realFs.writeFile(filePath, "" as any);
    });

    await expect(
      selfUpdate({
        downloadUrl: "https://example.com/dya-linux-x64.tar.gz",
        targetPath,
        targetVersion: "0.2.0",
      }),
    ).rejects.toThrow("Disk full");
  });
});
