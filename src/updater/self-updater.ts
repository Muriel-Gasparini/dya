import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";

import type { UpdateOptions } from "./types.js";

/**
 * Downloads the new binary from a .tar.gz URL and performs atomic replacement.
 *
 * Strategy:
 *   1. Download .tar.gz to <targetDir>/.dya-update.tar.gz
 *   2. Extract to a temp dir via tar
 *   3. copyFile extracted binary to <targetDir>/.dya-update.tmp
 *   4. Atomic rename .dya-update.tmp -> targetPath
 *   5. chmod 0o755
 *   6. Clean up temp files
 *
 * The original binary is never corrupted because rename is atomic on the same filesystem.
 */
export async function selfUpdate(options: UpdateOptions): Promise<void> {
  const { downloadUrl, targetPath, targetVersion } = options;

  const targetDir = path.dirname(targetPath);
  const tmpTar = targetPath + ".update.tar.gz";
  const tmpBin = targetPath + ".update.tmp";
  let extractDir: string | null = null;

  try {
    // 1. Download the tar.gz
    let response: Response;
    try {
      response = await globalThis.fetch(downloadUrl);
    } catch (err) {
      throw new Error(
        `Falha no download: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Falha no download: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(tmpTar, buffer);

    // 2. Extract to temp dir
    extractDir = await fs.mkdtemp(path.join(os.tmpdir(), "dya-extract-"));

    try {
      await execFileAsync("tar", ["xzf", tmpTar, "-C", extractDir]);
    } catch (err) {
      throw new Error(
        `Falha ao extrair o pacote: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 3. Copy extracted binary to same dir as target (for same-fs rename)
    const extractedBin = path.join(extractDir, "dya");
    try {
      await fs.copyFile(extractedBin, tmpBin);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") {
        throw new Error(
          "Sem permissao para atualizar. Rode com permissoes adequadas ou mova o binario para ~/.local/bin",
        );
      }
      throw err;
    }

    // 4. Atomic rename
    try {
      await fs.rename(tmpBin, targetPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") {
        throw new Error(
          "Sem permissao para atualizar. Rode com permissoes adequadas ou mova o binario para ~/.local/bin",
        );
      }
      throw err;
    }

    // 5. Ensure executable
    await fs.chmod(targetPath, 0o755);

    console.log(`Atualizado para v${targetVersion}`);
  } finally {
    // 6. Cleanup
    await safeUnlink(tmpTar);
    await safeUnlink(tmpBin);
    if (extractDir) {
      await safeRmdir(extractDir);
    }
  }
}

function execFileAsync(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {}, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout: stdout as string, stderr: stderr as string });
      }
    });
  });
}

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore errors during cleanup
  }
}

async function safeRmdir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore errors during cleanup
  }
}
