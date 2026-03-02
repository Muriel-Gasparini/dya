import { checkForUpdate } from "./version-checker.js";
import { selfUpdate } from "./self-updater.js";
import pkg from "../../package.json" with { type: "json" };

/**
 * Handler for `dya update`. Ignores cache, forces check.
 * - If new version: downloads without confirmation (explicit update)
 * - If already on latest: shows message
 * - If offline: shows error
 */
export async function updateCommand(): Promise<void> {
  console.log("Checking for updates...");

  const result = await checkForUpdate({
    currentVersion: pkg.version,
    checkIntervalMs: 0, // Ignore cache
  });

  if (result === null) {
    console.log(
      "Could not check for updates. Check your connection.",
    );
    return;
  }

  if (!result.updateAvailable) {
    console.log(
      `You are already on the latest version (v${result.currentVersion})`,
    );
    return;
  }

  if (result.downloadUrl === null) {
    console.log(
      `New version v${result.latestVersion} available but no binary for your platform. Download manually at https://github.com/Muriel-Gasparini/dya/releases/latest`,
    );
    return;
  }

  console.log(
    `New version v${result.latestVersion} found. Downloading...`,
  );

  try {
    await selfUpdate({
      downloadUrl: result.downloadUrl,
      targetPath: process.execPath,
      targetVersion: result.latestVersion,
    });
  } catch (err) {
    console.error(
      `Update failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}
