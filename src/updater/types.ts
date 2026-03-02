/**
 * Types and utility functions for the updater module.
 */

/** Cache state persisted at ~/.config/dya/update-check.json */
export interface UpdateCheckState {
  lastCheckAt: string; // ISO 8601 timestamp
  latestVersion: string; // e.g. "0.2.0" (no "v" prefix)
}

/** Options for checkForUpdate() */
export interface CheckOptions {
  currentVersion: string; // Local version from package.json
  owner?: string; // Default: "Muriel-Gasparini"
  repo?: string; // Default: "dya"
  configDir?: string; // Default: ~/.config/dya
  checkIntervalMs?: number; // Default: 86400000 (24h)
  timeoutMs?: number; // Default: 2000
}

/** Result of a version check */
export interface CheckResult {
  updateAvailable: boolean;
  latestVersion: string;
  currentVersion: string;
  downloadUrl: string | null; // URL of the asset for the current platform
}

/** Options for selfUpdate() */
export interface UpdateOptions {
  downloadUrl: string; // URL of the .tar.gz on GitHub Release
  targetPath: string; // Path of the current binary (process.execPath)
  targetVersion: string; // For success message
}

/**
 * Returns the expected asset name for the current platform and architecture.
 * Format: dya-${platform}-${arch}.tar.gz
 */
export function getAssetName(): string {
  return `dya-${process.platform}-${process.arch}.tar.gz`;
}

/**
 * Compares two semver strings "X.Y.Z" numerically.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const partsA = a.split("-")[0].split(".").map(Number);
  const partsB = b.split("-")[0].split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const va = partsA[i] ?? 0;
    const vb = partsB[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }

  return 0;
}
