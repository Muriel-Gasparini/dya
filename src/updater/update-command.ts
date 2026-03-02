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
  console.log("Verificando atualizacoes...");

  const result = await checkForUpdate({
    currentVersion: pkg.version,
    checkIntervalMs: 0, // Ignore cache
  });

  if (result === null) {
    console.log(
      "Nao foi possivel verificar atualizacoes. Verifique sua conexao.",
    );
    return;
  }

  if (!result.updateAvailable) {
    console.log(
      `Voce ja esta na versao mais recente (v${result.currentVersion})`,
    );
    return;
  }

  if (result.downloadUrl === null) {
    console.log(
      `Nova versao v${result.latestVersion} disponivel mas sem binario para sua plataforma. Baixe manualmente em https://github.com/Muriel-Gasparini/dya/releases/latest`,
    );
    return;
  }

  console.log(
    `Nova versao v${result.latestVersion} encontrada. Baixando...`,
  );

  try {
    await selfUpdate({
      downloadUrl: result.downloadUrl,
      targetPath: process.execPath,
      targetVersion: result.latestVersion,
    });
  } catch (err) {
    console.error(
      `Erro ao atualizar: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}
