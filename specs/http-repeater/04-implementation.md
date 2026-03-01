# Implementation — HTTP Repeater

## Summary of changes

- T1 completa: projeto inicializado com git, pnpm, TypeScript, vitest, estrutura de pastas
- T2 completa: tipos compartilhados (config + request) e classes de erro (ConfigError, TemplateError) com TDD
- T3 completa: Zod schema (repeaterConfigSchema) + YAML config parser (parseConfig) com TDD
- T4 completa: FakerTemplateEngine (resolve, resolveRecord, validateRecord) com TDD

## Progress

- [x] T1 — Setup do projeto
- [x] T2 — Types e Errors
- [x] T3 — ConfigParser (schema + YAML)
- [x] T4 — TemplateEngine
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
- Decisao (T3): TDD estrito -- testes escritos primeiro (RED), depois implementacao (GREEN). 34 testes novos (22 schema + 12 parser).
- Decisao (T3): Adicionei `@types/node` como devDependency -- necessario para `node:fs/promises` e `NodeJS.ErrnoException` compilarem com tsc.
- Decisao (T3): Excluido `src/index.ts` do coverage no vitest.config.ts -- e placeholder sem logica.
- Decisao (T3): Extraido `fileErrorMessage()` e `formatZodError()` como funcoes auxiliares no parser.ts para melhor testabilidade e cobertura de branches.
- Decisao (T3): API do zod v4 e compativel com v3 para todos os metodos usados (z.object, z.enum, z.union, z.literal, .refine, .default, z.string().url(), z.number().int().min(), z.record). Sem necessidade de adaptacoes.
- Decisao (T4): TDD estrito -- testes escritos primeiro (RED), depois implementacao (GREEN). 28 testes novos no engine.test.ts.
- Decisao (T4): API do @faker-js/faker v10 e 100% compativel com v9 para todos os metodos usados (person.firstName, phone.number, string.numeric, string.alpha, datatype.boolean, number.int). Sem necessidade de adaptacoes.
- Decisao (T4): Para cobrir o branch "path aponta para objeto, nao funcao" nos testes, usei `faker.rawDefinitions.airline` que e um path valido de 2 niveis que aponta para um objeto (nao funcao).
- Decisao (T4): Para cobrir o branch fallback do parseArgs (argumento nao-numerico, nao-booleano, nao-quoted), usei `{{faker.string.alpha(cased)}}` que passa "cased" como string literal.

## Divergencias do spec

> Se algo foi implementado diferente do planejado, registre aqui.

- Spec dizia: vitest.config.ts sem mencao a passWithNoTests -> Implementado: adicionei `passWithNoTests: true` -> Motivo: necessario para `pnpm test` passar sem arquivos de teste (vitest v4 default e falhar)
- Spec dizia: zod v3 -> Implementado: zod v4.3.6 -> Motivo: v4 era a versao mais recente disponivel no momento da instalacao. API 100% compativel para os metodos usados.
- Spec nao mencionava `@types/node` -> Adicionado como devDependency -> Motivo: necessario para TypeScript reconhecer modulos `node:*` e namespace `NodeJS`.
- Spec dizia: @faker-js/faker v9 -> Implementado: @faker-js/faker v10.3.0 -> Motivo: v10 era a versao instalada. API 100% compativel para todos os metodos usados no TemplateEngine.

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

### T3 — Schema (22 testes)
- Config completa valida: todos os campos retornados corretamente
- Config minima (so method+url): defaults aplicados (headers={}, bodyType='none', body={}, queryParams={}, concurrency=1, total=1, timeoutMs=5000)
- Todos os HTTP methods validos: GET, POST, PUT, PATCH, DELETE
- Todos os body types validos: json, formdata, none
- URL com porta (localhost:3000): aceita
- Method invalido: rejeita
- URL invalida: rejeita
- Method ausente: rejeita
- URL ausente: rejeita
- total = 0: rejeita
- total negativo: rejeita
- total decimal (3.5): rejeita
- total string invalida ("abc"): rejeita
- total = "infinite": aceita
- concurrency = 0: rejeita
- concurrency negativo: rejeita
- concurrency > total (numerico): rejeita via refinement
- concurrency qualquer + total "infinite": aceita
- bodyType invalido ("xml"): rejeita
- Campos extras/desconhecidos: stripped (removidos)
- Boundary: concurrency = 1, total = 1
- Boundary: concurrency = total (exato)

### T3 — Parser (12 testes)
- Happy path: valid-config.yaml retorna RepeaterConfig completo
- Config minima: minimal-config.yaml retorna com defaults
- FormData config: formdata-config.yaml com bodyType e campos corretos
- Infinite config: infinite-config.yaml com total = "infinite"
- Arquivo nao encontrado: ConfigError com "Arquivo nao encontrado: <path>"
- YAML com sintaxe invalida: ConfigError
- Arquivo vazio: ConfigError com "Configuracao vazia ou invalida"
- Schema validation falha: ConfigError com "Configuracao invalida"
- EACCES (sem permissao): ConfigError com "Sem permissao de leitura"
- YAML com conteudo scalar (string, nao objeto): ConfigError
- YAML com conteudo numerico: ConfigError
- Erro FS generico (EISDIR, leitura de diretorio): ConfigError com "Erro ao ler arquivo"

### T4 — Template Engine resolve (15 testes)
- String sem template retorna inalterada
- String vazia retorna vazia
- Template simples {{faker.person.firstName}} retorna string nao vazia
- Template com args numericos {{faker.string.numeric(5)}} gera string de 5 chars
- Template com args string {{faker.string.alpha('5')}} funciona sem erro
- Multiplos templates na mesma string resolve todos
- Texto fixo + template "BR{{faker.string.numeric(11)}}" concatena corretamente
- Template com espacos {{ faker.person.firstName }} funciona
- Templates adjacentes {{faker.person.firstName}}{{faker.person.lastName}} resolve ambos
- Path invalido (modulo nao existe) {{faker.naoExiste.metodo}} -> TemplateError
- Path invalido (metodo nao existe) {{faker.phone.naoExiste}} -> TemplateError
- Path de 1 nivel {{faker.phone}} nao da match na regex, retorna inalterado
- Path que aponta para objeto {{faker.rawDefinitions.airline}} -> TemplateError "nao e um metodo"
- Template com parenteses vazios {{faker.person.firstName()}} funciona
- Resultado nao-string (faker.number.int) e convertido para string
- Argumento nao-numerico/nao-booleano/nao-quoted (fallback parseArgs) funciona
- Template com arg booleano {{faker.datatype.boolean}} funciona

### T4 — Template Engine resolveRecord (4 testes)
- Record vazio retorna vazio
- Record com mix de fixo e template resolve corretamente
- Record com template invalido lanca TemplateError
- resolveRecord nao muta o record original

### T4 — Template Engine validateRecord (7 testes)
- Templates validos nao lancam erro
- Template invalido lanca TemplateError
- Record sem templates nao lanca erro
- validateRecord NAO gera valores (spy confirma que faker.phone.number nao foi chamado)
- Path inexistente lanca TemplateError
- Path que aponta para objeto (nao funcao) lanca TemplateError "nao e um metodo"
- Record misto com templates validos e texto fixo nao lanca erro

## Validation evidence

### T3

- Coverage (unit): 100% stmts, 82.35% branches, 100% funcs, 100% lines (above 80% threshold)
- Test command(s): `pnpm test`, `pnpm test:coverage`, `pnpm build`
- Output/result:

```
$ pnpm build
> repeater@0.1.0 build /home/tiuras/pessoal/repeater
> tsc
(exit code 0)

$ pnpm test
> repeater@0.1.0 test /home/tiuras/pessoal/repeater
> vitest run
 3 test files, 48 tests passed

$ pnpm test:coverage
 Coverage report:
 parser.ts: 100% stmts, 80% branches, 100% funcs, 100% lines
 schema.ts: 100% stmts, 100% branches, 100% funcs, 100% lines
 Summary: 100% stmts, 82.35% branches, 100% funcs, 100% lines
```

### T4

- Coverage (unit): 94.73% stmts, 86.36% branches, 100% funcs, 100% lines (above 80% threshold)
- Test command(s): `pnpm test`, `pnpm test:coverage`, `pnpm build`
- Output/result:

```
$ pnpm build
> repeater@0.1.0 build /home/tiuras/pessoal/repeater
> tsc
(exit code 0)

$ pnpm test
> repeater@0.1.0 test /home/tiuras/pessoal/repeater
> vitest run
 4 test files, 76 tests passed

$ pnpm test:coverage
 Coverage report:
 engine.ts: 94.73% stmts, 86.36% branches, 100% funcs, 100% lines
 Summary: 96.72% stmts, 84.61% branches, 100% funcs, 100% lines
```

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
# T3:
pnpm add -D @types/node
pnpm test:coverage  # 100% stmts, 82% branches
pnpm build          # OK
git commit -m "feat: add zod schema validation and YAML config parser (T3)"
# T4:
pnpm test               # 76 tests passed (4 files)
pnpm test:coverage       # 96.72% stmts, 84.61% branches
pnpm build               # OK
git commit -m "feat: add FakerTemplateEngine with resolve, resolveRecord, validateRecord (T4)"
```

## Notes

- TypeScript 5.9.3 instalado (spec dizia ^5.7, compativel)
- vitest 4.0.18 instalado (spec dizia v3, versao mais recente disponivel; API compativel)
- zod 4.3.6 instalado (spec dizia v3, versao mais recente disponivel)
- @faker-js/faker 10.3.0, commander 14.0.3, undici 7.22.0, p-limit 7.3.0

## Handoff para Review

### O que mudou
- Projeto criado do zero com toda infraestrutura de build/test
- T3: Zod schema (repeaterConfigSchema) e YAML config parser (parseConfig) implementados com TDD
- T4: FakerTemplateEngine com resolve, resolveRecord, validateRecord implementados com TDD

### Arquivos tocados
- package.json, pnpm-lock.yaml
- tsconfig.json
- vitest.config.ts
- .gitignore
- src/index.ts (placeholder)
- src/cli/.gitkeep, src/config/.gitkeep, src/template/.gitkeep, src/request/.gitkeep
- tests/unit/cli/.gitkeep, tests/unit/config/.gitkeep, tests/unit/template/.gitkeep, tests/unit/request/.gitkeep, tests/fixtures/.gitkeep
- bin/.gitkeep
- **T3**: src/config/schema.ts, src/config/parser.ts
- **T3**: tests/unit/config/schema.test.ts, tests/unit/config/parser.test.ts
- **T3**: tests/fixtures/valid-config.yaml, minimal-config.yaml, formdata-config.yaml, infinite-config.yaml, invalid-config.yaml
- **T4**: src/template/engine.ts
- **T4**: tests/unit/template/engine.test.ts

### Como testar manualmente
- `pnpm build` deve compilar sem erro
- `pnpm test` deve rodar sem erro (76 testes, exit code 0)
- `pnpm test:coverage` deve passar com coverage >= 80% em todos os thresholds

### Preocupacoes / pontos de atencao
- Versoes de deps sao mais recentes que o spec (vitest 4 vs 3, zod 4 vs 3, etc.) -- APIs compatveis confirmado na T3
- @types/node adicionado como devDep (nao estava no spec original)
