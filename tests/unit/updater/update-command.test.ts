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

    expect(consoleSpy).toHaveBeenCalledWith("Verificando atualizacoes...");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Nova versao v0.2.0 encontrada"),
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
      "Voce ja esta na versao mais recente (v0.1.0)",
    );
    expect(selfUpdate).not.toHaveBeenCalled();
  });

  it("should show error message when offline (checkForUpdate returns null)", async () => {
    vi.mocked(checkForUpdate).mockResolvedValue(null);

    await updateCommand();

    expect(consoleSpy).toHaveBeenCalledWith(
      "Nao foi possivel verificar atualizacoes. Verifique sua conexao.",
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
      expect.stringContaining("sem binario para sua plataforma"),
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
      new Error("Falha no download: Network error"),
    );

    await updateCommand();

    expect(consoleErrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Falha no download"),
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
