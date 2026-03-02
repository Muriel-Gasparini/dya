import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the version-checker module
vi.mock("../../../src/updater/version-checker.js", () => ({
  checkForUpdate: vi.fn(),
}));

// Mock the self-updater module
vi.mock("../../../src/updater/self-updater.js", () => ({
  selfUpdate: vi.fn(),
}));

import { updateCommand } from "../../../src/updater/update-command.js";
import { checkForUpdate } from "../../../src/updater/version-checker.js";
import { selfUpdate } from "../../../src/updater/self-updater.js";

describe("updateCommand", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("should call selfUpdate without confirmation when update is available", async () => {
    vi.mocked(checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      latestVersion: "0.2.0",
      currentVersion: "0.1.0",
      downloadUrl:
        "https://github.com/Muriel-Gasparini/dya/releases/download/v0.2.0/dya-linux-x64.tar.gz",
    });
    vi.mocked(selfUpdate).mockResolvedValue(undefined);

    await updateCommand();

    expect(consoleSpy).toHaveBeenCalledWith("Checking for updates...");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("New version v0.2.0 found"),
    );
    expect(selfUpdate).toHaveBeenCalledWith({
      downloadUrl:
        "https://github.com/Muriel-Gasparini/dya/releases/download/v0.2.0/dya-linux-x64.tar.gz",
      targetPath: process.execPath,
      targetVersion: "0.2.0",
    });
  });

  it("should show message when already on latest version", async () => {
    vi.mocked(checkForUpdate).mockResolvedValue({
      updateAvailable: false,
      latestVersion: "0.1.0",
      currentVersion: "0.1.0",
      downloadUrl: null,
    });

    await updateCommand();

    expect(consoleSpy).toHaveBeenCalledWith(
      "You are already on the latest version (v0.1.0)",
    );
    expect(selfUpdate).not.toHaveBeenCalled();
  });

  it("should show error message when offline (checkForUpdate returns null)", async () => {
    vi.mocked(checkForUpdate).mockResolvedValue(null);

    await updateCommand();

    expect(consoleSpy).toHaveBeenCalledWith(
      "Could not check for updates. Check your connection.",
    );
    expect(selfUpdate).not.toHaveBeenCalled();
  });

  it("should show message when downloadUrl is null", async () => {
    vi.mocked(checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      latestVersion: "0.2.0",
      currentVersion: "0.1.0",
      downloadUrl: null,
    });

    await updateCommand();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("no binary for your platform"),
    );
    expect(selfUpdate).not.toHaveBeenCalled();
  });

  it("should show error and exit 1 when selfUpdate fails", async () => {
    vi.mocked(checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      latestVersion: "0.2.0",
      currentVersion: "0.1.0",
      downloadUrl: "https://example.com/dya.tar.gz",
    });
    vi.mocked(selfUpdate).mockRejectedValue(
      new Error("Download failed: Network error"),
    );

    await updateCommand();

    expect(consoleErrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Download failed"),
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("should call checkForUpdate with checkIntervalMs: 0 to ignore cache", async () => {
    vi.mocked(checkForUpdate).mockResolvedValue({
      updateAvailable: false,
      latestVersion: "0.1.0",
      currentVersion: "0.1.0",
      downloadUrl: null,
    });

    await updateCommand();

    expect(checkForUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        checkIntervalMs: 0,
      }),
    );
  });
});
