# Implementation — Distribution

## Summary of changes

### T1 — Configuracao base e push inicial
- Added `resolveJsonModule: true` to `tsconfig.json`
- Added `build:bin` scripts to `package.json` for 4 platforms + local
- Updated `.gitignore` to ignore `dya`, `dya-*`, `*.tar.gz`
- Created `src/updater/` directory
- **Push deferred**: remote not yet configured; needs user action

### T2 — Types do updater
- Created `src/updater/types.ts` with:
  - Interfaces: `UpdateCheckState`, `CheckOptions`, `CheckResult`, `UpdateOptions`
  - `getAssetName()`: returns `dya-${platform}-${arch}.tar.gz`
  - `compareVersions(a, b)`: numeric semver comparison returning -1, 0, or 1
- 12 unit tests in `tests/unit/updater/types.test.ts`

### T3 — Version checker (cache + GitHub API)
- Created `src/updater/version-checker.ts` with:
  - `loadCheckState(configDir)`: reads cache, handles ENOENT and corrupt JSON
  - `saveCheckState(configDir, state)`: writes cache, creates dir
  - `checkForUpdate(options)`: respects 24h cache, fetches GitHub API, handles errors silently
  - `checkAndNotify(options)`: interactive prompt via `readline/promises`, delegates to selfUpdate
- 25 unit tests in `tests/unit/updater/version-checker.test.ts`

### T4 — Self-updater (download + atomic replace)
- Created `src/updater/self-updater.ts` with:
  - `selfUpdate(options)`: download .tar.gz, extract via tar, copyFile + atomic rename
  - Error handling: download failure, tar failure, EACCES permission denied
  - Cleanup in `finally` block (temp files always removed)
- 8 unit tests in `tests/unit/updater/self-updater.test.ts`

### T5 — Update command
- Created `src/updater/update-command.ts` with:
  - `updateCommand()`: forces check (checkIntervalMs: 0), no confirmation
  - Handles: update available, already latest, offline, no asset, selfUpdate failure
- 6 unit tests in `tests/unit/updater/update-command.test.ts`

### T6 — Integracao no CLI
- Modified `src/cli/index.ts`:
  - Version from `package.json` via `import pkg from "../../package.json" with { type: "json" }`
  - Registered `update` command with `updateCommand` action
  - Added `postAction` hook calling `checkAndNotify`
- Updated `tests/unit/cli/index.test.ts`:
  - Version test now checks against `pkg.version` (dynamic)
  - Added test for `update` command registration
  - 6 tests (was 5)

### T7 — Build do binario + teste E2E
- Bun compile successful: `bun build --compile bin/repeater.ts --outfile dya`
- Binary size: 101MB (acceptable, compresses to ~30MB)
- Tested manually:
  - `./dya --help` — shows all commands including `update`
  - `./dya --version` — shows `0.1.0`
  - `./dya update` — "Nao foi possivel verificar atualizacoes" (expected: no releases yet)
  - `./dya init` — @inquirer/prompts works correctly with Bun compile (interactive wizard functional)
- **No blocker with @inquirer/prompts** — Bun compile is fully compatible

### T8 — Script de instalacao (install.sh)
- Created `install.sh` at project root with:
  - OS detection: `uname -s` -> linux/darwin
  - Arch detection: `uname -m` -> x64/arm64 (handles x86_64, aarch64, arm64)
  - Download from GitHub Release latest
  - Install to `~/.local/bin/dya`, chmod +x
  - PATH check with warning
  - Error handling: unsupported platform, missing curl, download failure
  - `set -e` for fail-fast, `trap` for temp cleanup

### T9 — GitHub Actions workflows
- Created `.github/workflows/ci.yml`:
  - Trigger: `pull_request` to `main`
  - Steps: checkout, pnpm setup, Node 20, install, lint, test:coverage
- Created `.github/workflows/release.yml`:
  - Trigger: push tag `v*`
  - Matrix: 4 platforms (linux-x64, linux-arm64, darwin-x64, darwin-arm64)
  - Steps: checkout, setup Bun, install, compile, tar.gz, upload artifact
  - Release job: download artifacts, create GitHub Release with `softprops/action-gh-release`

## Progress checklist

- [x] T1 — Configuracao base e push inicial (push deferred)
- [x] T2 — Types do updater (12 tests)
- [x] T3 — Version checker (25 tests)
- [x] T4 — Self-updater (8 tests)
- [x] T5 — Update command (6 tests)
- [x] T6 — Integracao no CLI (6 tests)
- [x] T7 — Build do binario + teste E2E (manual)
- [x] T8 — Script de instalacao
- [x] T9 — GitHub Actions workflows
- [ ] T10 — Primeira release + validacao E2E (manual, needs push + tag)

## Decisions & tradeoffs

1. **Stub self-updater during T3**: Created a stub self-updater.ts to resolve imports during version-checker development. Fully implemented in T4.

2. **readline/promises for user prompt**: Used `node:readline/promises` instead of @inquirer/prompts for the update confirmation prompt in checkAndNotify. This avoids heavy dependency for a simple yes/no question and works reliably in both Node and Bun.

3. **Push deferred**: T1 specified push to GitHub, but remote is not configured. Deferred to after all code tasks are done, requiring user action to add remote.

4. **Binary size 101MB**: Slightly over the 100MB "target" in the spec, but the spec noted "aceitavel" for standalone CLI. Compressed .tar.gz will be ~30MB.

## Divergencias do spec

1. **T1 push**: The spec says "Push feito para Muriel-Gasparini/dya". This requires user action (git remote add + push). Deferred.

2. **checkAndNotify prompt**: Spec says "mostra 'Nova versao vX.Y.Z disponivel. Atualizar? [s/N]'". Implementation uses `readline/promises` for the prompt instead of unspecified I/O method. The prompt text matches the spec exactly.

3. **Binary size**: Spec says "< 100MB". Actual is 101MB. Within acceptable range per spec notes.

## Validation evidence

### Build
```
$ pnpm build
> dya@0.1.0 build
> tsc
(no errors)
```

### Tests (281 total, all passing)
```
$ pnpm test
Test Files  16 passed (16)
Tests       281 passed (281)
```

### Coverage (all thresholds >= 80%)
```
$ pnpm test:coverage
Statements   : 95.94% ( 355/370 )
Branches     : 89.08% ( 155/174 )
Functions    : 93.47% ( 43/46 )
Lines        : 96.65% ( 347/359 )
```

### Binary E2E (manual)
```
$ bun build --compile bin/repeater.ts --outfile dya
[80ms]  bundle  294 modules
[84ms] compile  dya

$ ./dya --help
Usage: dya [options] [command]
DYA - Destroy Your App
Commands: run, init, update, help

$ ./dya --version
0.1.0

$ ./dya update
Verificando atualizacoes...
Nao foi possivel verificar atualizacoes. Verifique sua conexao.

$ ./dya init
(interactive wizard works with @inquirer/prompts)
```

### CLI integration
```
$ node dist/bin/repeater.js --version
0.1.0

$ node dist/bin/repeater.js update --help
Usage: dya update [options]
Check and install latest version
```

## Edge cases cobertos nos testes

### types.test.ts (12 tests)
- getAssetName: all 4 platform/arch combinations
- compareVersions: major/minor/patch bumps, equal, large numbers, numeric vs lexicographic

### version-checker.test.ts (25 tests)
- loadCheckState: valid file, ENOENT, corrupted JSON, missing directory
- saveCheckState: normal save, directory creation
- checkForUpdate: cache valid, cache expired, cache missing, new version, same version, older version, fetch timeout, network error, 403 rate limit, 404, no asset for platform, tag without "v" prefix, cache update after check, custom checkIntervalMs
- checkAndNotify: user confirms, user declines, no update, offline/error, downloadUrl null

### self-updater.test.ts (8 tests)
- Happy path: download + extract + rename
- chmod 0o755 verification
- Temp file cleanup after success
- Download failure (fetch error)
- Non-200 HTTP response
- Tar extraction failure
- Permission denied (EACCES)
- Temp file cleanup on error

### update-command.test.ts (6 tests)
- Update available (calls selfUpdate without confirmation)
- Already on latest
- Offline
- No asset for platform
- selfUpdate failure (exit 1)
- checkIntervalMs: 0 (ignores cache)

## Files created/modified

### New files
- `src/updater/types.ts`
- `src/updater/version-checker.ts`
- `src/updater/self-updater.ts`
- `src/updater/update-command.ts`
- `tests/unit/updater/types.test.ts`
- `tests/unit/updater/version-checker.test.ts`
- `tests/unit/updater/self-updater.test.ts`
- `tests/unit/updater/update-command.test.ts`
- `install.sh`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`

### Modified files
- `tsconfig.json` — added resolveJsonModule
- `package.json` — added build:bin scripts
- `.gitignore` — added binary patterns
- `src/cli/index.ts` — integrated updater
- `tests/unit/cli/index.test.ts` — updated for new command and dynamic version
