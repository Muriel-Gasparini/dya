# Implementation — HTTP Repeater

## Summary of changes

- T1 completa: projeto inicializado com git, pnpm, TypeScript, vitest, estrutura de pastas
- T2 completa: tipos compartilhados (config + request) e classes de erro (ConfigError, TemplateError) com TDD

## Progress

- [x] T1 — Setup do projeto
- [x] T2 — Types e Errors
- [ ] T3 — ConfigParser (schema + YAML)
- [ ] T4 — TemplateEngine
- [ ] T5 — HttpClient
- [ ] T6 — BodyBuilder
- [ ] T7 — RequestExecutor
- [ ] T8 — Reporter
- [ ] T9 — Runner
- [ ] T10 — CLI

## Decisions & tradeoffs

> Registre decisoes tomadas durante a implementacao que diferem ou
> complementam o que estava nos specs.

- Decisao: Adicionei `passWithNoTests: true` no vitest.config.ts -> Motivo: vitest v4 retorna exit code 1 quando nao encontra arquivos de teste. Sem essa opcao, `pnpm test` falharia na T1 (antes de existirem testes). Sera removido quando houver testes reais, ou mantido para conveniencia.
- Decisao: Adicionei `.gitkeep` em diretorios vazios (src/cli, src/config, etc.) -> Motivo: git nao rastreia diretorios vazios. Os .gitkeep serao removidos quando arquivos reais forem adicionados.
- Decisao (T2): Segui TDD estrito -- testes escritos primeiro (red), depois implementacao (green). Nenhuma divergencia do spec nos tipos ou erros.
- Decisao (T2): Removidos .gitkeep de src/config, src/template, src/request -- agora tem arquivos reais.

## Divergencias do spec

> Se algo foi implementado diferente do planejado, registre aqui.

- Spec dizia: vitest.config.ts sem mencao a passWithNoTests -> Implementado: adicionei `passWithNoTests: true` -> Motivo: necessario para `pnpm test` passar sem arquivos de teste (vitest v4 default e falhar)

## Validation evidence

### T1

- Coverage (unit): N/A (T1 nao tem codigo para testar)
- Test command(s): `pnpm build`, `pnpm test`
- Output/result:

```
$ pnpm build
> repeater@0.1.0 build /home/tiuras/pessoal/repeater
> tsc
(exit code 0)

$ pnpm test
> repeater@0.1.0 test /home/tiuras/pessoal/repeater
> vitest run
No test files found, exiting with code 0
```

### T2

- Coverage (unit): errors.ts e types.ts sao excluidos do coverage no vitest.config.ts (classes triviais/tipos puros), mas testes unitarios validam contrato
- Test command(s): `pnpm build`, `pnpm test`
- Output/result:

```
$ pnpm build
> repeater@0.1.0 build /home/tiuras/pessoal/repeater
> tsc
(exit code 0)

$ pnpm test
> repeater@0.1.0 test /home/tiuras/pessoal/repeater
> vitest run
 14 tests passed (1 file)
```

## Edge cases cobertos nos testes

### T1
- N/A (T1 e puramente setup, sem codigo de negocio)

### T2
- ConfigError: instanciavel, name correto, preserva message, instanceof Error, stack trace definido, mensagem vazia
- TemplateError: instanciavel, name correto, preserva message, instanceof Error, stack trace definido, mensagem vazia
- Isolacao: ConfigError nao e instanceof TemplateError e vice-versa

## Commands executed

> Registre comandos importantes para reproduzir/verificar.

```bash
git init
pnpm init
# Editado package.json manualmente (name, version, type, bin, engines, scripts)
pnpm add undici @faker-js/faker commander @inquirer/prompts yaml zod p-limit
pnpm add -D typescript vitest @vitest/coverage-v8
# Criados: tsconfig.json, vitest.config.ts, .gitignore, src/index.ts
# Criada estrutura: src/cli,config,template,request + tests/unit/* + bin/
pnpm build  # OK
pnpm test   # OK
git add . && git commit -m "chore: initial project setup"
```

## Notes

- TypeScript 5.9.3 instalado (spec dizia ^5.7, compativel)
- vitest 4.0.18 instalado (spec dizia v3, versao mais recente disponivel; API compativel)
- zod 4.3.6 instalado (spec dizia v3, versao mais recente disponivel)
- @faker-js/faker 10.3.0, commander 14.0.3, undici 7.22.0, p-limit 7.3.0

## Handoff para Review

### O que mudou
- Projeto criado do zero com toda infraestrutura de build/test

### Arquivos tocados
- package.json, pnpm-lock.yaml
- tsconfig.json
- vitest.config.ts
- .gitignore
- src/index.ts (placeholder)
- src/cli/.gitkeep, src/config/.gitkeep, src/template/.gitkeep, src/request/.gitkeep
- tests/unit/cli/.gitkeep, tests/unit/config/.gitkeep, tests/unit/template/.gitkeep, tests/unit/request/.gitkeep, tests/fixtures/.gitkeep
- bin/.gitkeep

### Como testar manualmente
- `pnpm build` deve compilar sem erro
- `pnpm test` deve rodar sem erro (0 testes, exit code 0)

### Preocupacoes / pontos de atencao
- Versoes de deps sao mais recentes que o spec (vitest 4 vs 3, zod 4 vs 3, etc.) -- APIs podem ter mudancas; monitorar nas proximas tasks
