import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline/promises";

import {
  type UpdateCheckState,
  type CheckOptions,
  type CheckResult,
  getAssetName,
  compareVersions,
} from "./types.js";
import { selfUpdate } from "./self-updater.js";

const DEFAULT_OWNER = "Muriel-Gasparini";
const DEFAULT_REPO = "dya";
const DEFAULT_CHECK_INTERVAL_MS = 86_400_000; // 24 hours
const DEFAULT_TIMEOUT_MS = 2000;
const CHECK_FILE = "update-check.json";

function defaultConfigDir(): string {
  return path.join(os.homedir(), ".config", "dya");
}

/**
 * Loads the cached check state from disk.
 * Returns null if file does not exist or is corrupted.
 * Creates the directory if it does not exist.
 */
export async function loadCheckState(
  configDir: string,
): Promise<UpdateCheckState | null> {
  try {
    await fs.mkdir(configDir, { recursive: true });
    const content = await fs.readFile(
      path.join(configDir, CHECK_FILE),
      "utf-8",
    );
    return JSON.parse(content) as UpdateCheckState;
  } catch {
    return null;
  }
}

/**
 * Saves the check state to disk.
 * Creates the directory if it does not exist.
 */
export async function saveCheckState(
  configDir: string,
  state: UpdateCheckState,
): Promise<void> {
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, CHECK_FILE),
    JSON.stringify(state),
    "utf-8",
  );
}

/**
 * Checks for a newer version via GitHub API, respecting cache interval.
 * Returns null if unable to check (offline, timeout, rate limit).
 */
export async function checkForUpdate(
  options: CheckOptions,
): Promise<CheckResult | null> {
  const {
    currentVersion,
    owner = DEFAULT_OWNER,
    repo = DEFAULT_REPO,
    configDir = defaultConfigDir(),
    checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  try {
    // Check cache
    const cached = await loadCheckState(configDir);
    if (cached) {
      const elapsed = Date.now() - new Date(cached.lastCheckAt).getTime();
      if (elapsed < checkIntervalMs) {
        // Cache is still valid, return result based on cached data
        const updateAvailable =
          compareVersions(cached.latestVersion, currentVersion) > 0;
        return {
          updateAvailable,
          latestVersion: cached.latestVersion,
          currentVersion,
          downloadUrl: null, // No download URL in cache (only on fresh check)
        };
      }
    }

    // Fetch from GitHub API
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const response = await globalThis.fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "dya-cli",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      tag_name: string;
      assets: Array<{ name: string; browser_download_url: string }>;
    };

    // Parse version (remove "v" prefix if present)
    const latestVersion = data.tag_name.replace(/^v/, "");

    // Find asset for current platform
    const assetName = getAssetName();
    const asset = data.assets.find((a) => a.name === assetName);
    const downloadUrl = asset?.browser_download_url ?? null;

    const updateAvailable =
      compareVersions(latestVersion, currentVersion) > 0;

    // Update cache
    await saveCheckState(configDir, {
      lastCheckAt: new Date().toISOString(),
      latestVersion,
    });

    return {
      updateAvailable,
      latestVersion,
      currentVersion,
      downloadUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Checks for update and notifies the user interactively.
 * If user accepts, delegates to selfUpdate().
 * Silent on any error.
 */
export async function checkAndNotify(options: CheckOptions): Promise<void> {
  try {
    const result = await checkForUpdate(options);

    if (!result || !result.updateAvailable) {
      return;
    }

    if (result.downloadUrl === null) {
      console.log(
        `Nova versao v${result.latestVersion} disponivel mas sem binario para sua plataforma. Baixe manualmente em https://github.com/${options.owner ?? DEFAULT_OWNER}/${options.repo ?? DEFAULT_REPO}/releases/latest`,
      );
      return;
    }

    // Ask user for confirmation
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const answer = await rl.question(
        `Nova versao v${result.latestVersion} disponivel. Atualizar? [s/N] `,
      );
      rl.close();

      if (answer.toLowerCase() === "s") {
        await selfUpdate({
          downloadUrl: result.downloadUrl,
          targetPath: process.execPath,
          targetVersion: result.latestVersion,
        });
      }
    } catch {
      rl.close();
    }
  } catch {
    // Silent on any error
  }
}
