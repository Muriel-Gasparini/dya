# Implementation — HTTP Repeater

## Summary of changes

- T1 completa: projeto inicializado com git, pnpm, TypeScript, vitest, estrutura de pastas
- T2 completa: tipos compartilhados (config + request) e classes de erro (ConfigError, TemplateError) com TDD
- T3 completa: Zod schema (repeaterConfigSchema) + YAML config parser (parseConfig) com TDD
- T4 completa: FakerTemplateEngine (resolve, resolveRecord, validateRecord) com TDD
- T5 completa: UndiciHttpClient (interface HttpClient + implementacao com undici, timeout, erros de rede) com TDD
- T6 completa: DefaultBodyBuilder (interface BodyBuilder + implementacao json/formdata/none) com TDD
- T7 completa: RequestExecutor (interface ExecuteOptions + classe RequestExecutor com DI, timing via performance.now(), error wrapping) com TDD
- T8 completa: ConsoleReporter (interface Reporter + classe ConsoleReporter com writer injection, reportResult para modo finito/infinito/erro, reportSummary com estatisticas formatadas) com TDD
- T9 completa: RepeaterRunner (interface RunnerDeps + classe RepeaterRunner com p-limit, backpressure para modo infinito, SIGINT handling, counter-based summary, abort()) com TDD
- T10 completa: CLI completa (commander setup, run-command handler, wizard interativo, entry point bin/repeater.ts) com TDD

## Progress

- [x] T1 — Setup do projeto
- [x] T2 — Types e Errors
- [x] T3 — ConfigParser (schema + YAML)
- [x] T4 — TemplateEngine
- [x] T5 — HttpClient
- [x] T6 — BodyBuilder
- [x] T7 — RequestExecutor
- [x] T8 — Reporter
- [x] T9 — Runner
- [x] T10 — CLI

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
- Decisao (T5): TDD estrito -- testes escritos primeiro (RED), depois implementacao (GREEN). 16 testes novos no http-client.test.ts.
- Decisao (T5): Para o body do undici.request, foi necessario um type assertion `as string | import("undici").FormData | undefined` porque `globalThis.FormData` (de @types/node) e `undici.FormData` sao estruturalmente incompativeis no TypeScript (falta `[Symbol.toStringTag]`). Em runtime sao o mesmo objeto.
- Decisao (T5): Deteccao de AbortError usa `error.name === "AbortError"` (nao instanceof) conforme spec, para evitar problemas com diferentes contextos de importacao.
- Decisao (T5): Headers de resposta com valores array (ex: set-cookie) sao convertidos pegando o primeiro elemento. Headers com valor undefined/null sao ignorados (nao incluidos no Record).
- Decisao (T6): TDD estrito -- testes escritos primeiro (RED), depois implementacao (GREEN). 10 testes novos no body-builder.test.ts.
- Decisao (T6): Usa globalThis.FormData (nativo Node 18+), sem dependencia externa. contentType null para formdata (undici seta boundary automaticamente).
- Decisao (T7): TDD estrito -- testes escritos primeiro (RED), depois implementacao (GREEN). 21 testes novos no executor.test.ts.
- Decisao (T7): Exportada interface `ExecuteOptions` separada (nao reutiliza HttpRequestOptions) para manter index no contrato sem poluir o HttpClient.
- Decisao (T7): `performance.now()` usado via global (disponivel em Node 20+ sem import), com `Math.round` para converter para inteiro.
- Decisao (T8): TDD estrito -- testes escritos primeiro (RED), depois implementacao (GREEN). 15 testes novos no reporter.test.ts.
- Decisao (T8): WriterFunctions injetavel via construtor com defaults para console.log/console.error. Testes usam mock `(msg) => output.push(msg)` para capturar output.
- Decisao (T8): Reporter NAO acumula resultados -- apenas formata e imprime. Summary e passado pronto pelo Runner.
- Decisao (T8): Porcentagem formatada com `(count / total * 100).toFixed(1)%`. Quando total=0, exibe `0.0%` para evitar division by zero.
- Decisao (T8): totalDurationMs >= 1000 e exibido em segundos com 1 decimal (ex: 12.5s). Abaixo de 1000, exibido em ms (ex: 500ms).
- Decisao (T8): durationMs no reportResult exibido como inteiro via Math.round para legibilidade.
- Decisao (T8): Teste de modo infinito corrigido -- assertion `not.toContain("/")` era falso positivo (URL contem /). Substituido por regex `not.toMatch(/\[\d+\/\d+\]/)` que verifica especificamente o padrao [index/total].
- Decisao (T9): TDD estrito -- testes escritos primeiro (RED), depois implementacao (GREEN). 29 testes novos no runner.test.ts.
- Decisao (T9): Backpressure no loop infinito -- o for loop aguarda `Promise.race(pending)` quando todos os slots de concorrencia estao ocupados. Sem isso, o loop cria milhoes de promises na fila do p-limit e causa OOM (JavaScript heap out of memory). Essa tecnica e essencial e nao estava explicitamente no spec.
- Decisao (T9): Para testar modo infinito sem depender de setTimeout/timing, o mock do requestExecutor chama `runner.abort()` internamente apos N execucoes. Isso garante testes deterministicos e rapidos.
- Decisao (T9): URL final preserva config.url original quando queryParams e vazio (sem criar new URL() + toString() desnecessariamente, evitando trailing slash ou encoding indesejado).
- Decisao (T9): Type assertion `config.total as number` necessario porque TypeScript nao permite comparar `number <= (number | "infinite")`. Em runtime, ja verificamos `isInfinite` antes.
- Decisao (T9): `this.aborted` resetado para false ao final de `execute()` para permitir reutilizacao da instancia.
- Decisao (T9): SIGINT handler e o arrow function inline `() => { this.aborted = true }`. Coverage do v8 marca como funcao nao coberta (83.33% funcs) porque nao emitimos SIGINT nos testes. Funcionalidade equivalente testada via `abort()`.
- Decisao (T10): TDD estrito -- testes escritos primeiro (RED), depois implementacao (GREEN). 9 testes no run-command.test.ts e 12 testes no wizard.test.ts.
- Decisao (T10): commander v14.0.3 e @inquirer/prompts v8.3.0 -- APIs compativeis com o spec. Commander v14 tem mesma API do v13 para Command, .argument, .option, .action.
- Decisao (T10): wizard coleta total como input (nao number) porque precisa aceitar a string "infinite" alem de numeros. Validacao inline no prompt com `validate()`.
- Decisao (T10): GET e DELETE automaticamente setam bodyType='none' sem perguntar. POST/PUT/PATCH permitem escolher json/formdata/none.
- Decisao (T10): Preview do YAML exibido entre delimitadores `--- Preview ---` e `--- Fim ---` conforme spec.
- Decisao (T10): `src/cli/index.ts` tem 0% coverage individual porque e puro wiring do commander (sem logica testavel). Handlers testados separadamente. Coverage global >= 80% em todos os thresholds.
- Decisao (T10): Mocking strategy -- run-command testa com vi.mock nos modulos importados (parseConfig, FakerTemplateEngine, RepeaterRunner). Wizard testa com vi.mock em @inquirer/prompts e node:fs/promises.

## Divergencias do spec

> Se algo foi implementado diferente do planejado, registre aqui.

- Spec dizia: vitest.config.ts sem mencao a passWithNoTests -> Implementado: adicionei `passWithNoTests: true` -> Motivo: necessario para `pnpm test` passar sem arquivos de teste (vitest v4 default e falhar)
- Spec dizia: zod v3 -> Implementado: zod v4.3.6 -> Motivo: v4 era a versao mais recente disponivel no momento da instalacao. API 100% compativel para os metodos usados.
- Spec nao mencionava `@types/node` -> Adicionado como devDependency -> Motivo: necessario para TypeScript reconhecer modulos `node:*` e namespace `NodeJS`.
- Spec dizia: @faker-js/faker v9 -> Implementado: @faker-js/faker v10.3.0 -> Motivo: v10 era a versao instalada. API 100% compativel para todos os metodos usados no TemplateEngine.
- T5: type assertion necessario no body para compatibilizar globalThis.FormData com undici.FormData no TypeScript (em runtime funciona sem cast).
- T9: Spec dizia p-limit v6 -> Implementado: p-limit 7.3.0 -> Motivo: versao instalada e 7.x. Import `import pLimit from 'p-limit'` funciona identicamente.
- T9: Adicionado mecanismo de backpressure (Promise.race) nao mencionado no spec -> Motivo: sem backpressure, modo infinito causa OOM ao acumular promises na fila do p-limit.

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

### T5 — HttpClient (16 testes)
- Happy path: mock retorna statusCode 200 e headers -> execute retorna HttpResponse correto
- Status codes variados (201, 400, 404, 500) -> todos retornados normalmente sem erro
- Body string (JSON) -> undici.request recebe body como string
- Body null (GET) -> undici.request recebe body undefined/null
- Timeout (AbortError) -> lanca erro com "Timeout de 3000ms excedido"
- Timeout com valor diferente (10000ms) -> mensagem inclui timeoutMs correto
- Erro de rede ECONNREFUSED -> lanca erro com "Conexao recusada (ECONNREFUSED)"
- Erro de DNS ENOTFOUND -> lanca erro com "Host nao encontrado (ENOTFOUND)"
- Erro desconhecido (Error sem code) -> re-throw com mensagem original
- Erro non-Error (string thrown) -> re-throw as-is (cobre branch `if (error instanceof Error)` false)
- AbortSignal.timeout chamado com timeoutMs correto (spy verifica)
- Signal passado para undici.request e instancia de AbortSignal
- Response body consumido (.body.dump() chamado uma vez)
- Headers de resposta com array (set-cookie) -> pega primeiro elemento
- Headers de resposta com valor undefined -> ignorados gracefully
- Headers da request passados corretamente para undici.request
- Method passado corretamente para undici.request (PATCH)

### T6 — BodyBuilder (10 testes)
- json: campos normais -> retorna JSON.stringify + contentType 'application/json'
- json: campos vazios -> retorna '{}' + contentType 'application/json'
- json: caracteres especiais (aspas, newlines, tabs, backslash) -> JSON.stringify escapa corretamente, parsed back OK
- json: unicode -> preservado corretamente
- formdata: campos normais -> retorna FormData com campos populados + contentType null
- formdata: campos vazios -> retorna FormData vazio (0 entries) + contentType null
- formdata: verificar FormData.get(key) retorna valores corretos para cada campo
- formdata: unicode -> preservado corretamente
- none: retorna body null + contentType null
- none: campos nao-vazios + bodyType 'none' -> ignora campos, retorna null

### T7 — RequestExecutor (21 testes)
- Happy path: httpClient retorna 200 -> RequestResult com status 200, error null
- durationMs > 0 em cenario de sucesso
- index propagado corretamente (42 -> result.index = 42)
- method propagado corretamente (POST -> result.method = "POST")
- url propagada corretamente (com query params)
- Status 500 -> RequestResult com status 500, error null (nao e erro do executor)
- Status 404 -> RequestResult com status 404, error null
- Status 400 -> RequestResult com status 400, error null
- Timeout -> RequestResult com status null, error contendo "Timeout"
- durationMs positivo em timeout
- index, method e url propagados em timeout
- Erro de rede ECONNREFUSED -> RequestResult com status null, error contendo "ECONNREFUSED"
- Erro de DNS ENOTFOUND -> RequestResult com status null, error contendo "ENOTFOUND"
- durationMs positivo em erro de rede
- Non-Error thrown ("string error") -> RequestResult com error = "string error"
- Undefined thrown -> RequestResult com error string definida
- TypeError thrown -> RequestResult com error contendo mensagem, NUNCA rejeita a promise
- durationMs reflete tempo real (~50ms delay -> durationMs >= 40)
- durationMs reflete tempo real em erro (~30ms delay -> durationMs >= 20)
- httpClient.execute chamado com url, method, headers, body, timeoutMs corretos
- httpClient.execute chamado com body null para GET

### T8 — Reporter (15 testes)
- reportResult modo finito: status 200, total 50 -> output contem [1/50], POST, 200, ms
- reportResult modo infinito: status 200, total 'infinite' -> output contem [1], sem padrao [index/total]
- reportResult com erro: status null, error "Timeout..." -> output contem ERR, "Timeout"
- reportResult status 404 -> output contem 404, NAO contem ERR (HTTP errors sao responses validas)
- reportResult status 500 -> output contem 500, NAO contem ERR
- reportResult inclui URL completa no output (incluindo query params)
- reportSummary completo: total, sucesso, falhas, avg, min, max, porcentagens, duracao total
- reportSummary com 0 requests: nao lanca erro, exibe 0.0% (division by zero evitada)
- reportSummary com todas falhas: successCount 0, 100.0% falhas
- reportSummary header "Summary" e footer "End" presentes
- reportSummary totalDurationMs >= 1000 -> exibido em segundos (1.5s)
- reportSummary totalDurationMs < 1000 -> exibido em ms (500ms)
- formatacao: durationMs exibido como inteiro (Math.round) -- 123.789 -> 124ms
- formatacao: method exibido em uppercase
- formatacao: avgDurationMs, minDurationMs, maxDurationMs arredondados como inteiros no summary

### T9 — Runner (29 testes)
- Happy path finito: total=3, concurrency=1 -> summary com 3 requests, 3 sucesso, 0 falha
- reportResult chamado 3x e reportSummary chamado 1x para total=3
- config.total passado como segundo argumento para reportResult
- avg/min/max durations calculados corretamente (100, 200, 300 -> avg=200, min=100, max=300)
- totalDurationMs >= 0
- Total=1: unica request executada, reportSummary chamado
- Concorrencia: total=5, concurrency=2 -> no maximo 2 em voo simultaneamente
- Concorrencia = total: total=3, concurrency=3 -> todas disparadas, 3 executadas
- Sequencial: concurrency=1 -> requests executadas em ordem [1, 2, 3]
- Modo infinito + abort: abort() apos 3 requests -> summary parcial com >= 3 requests
- Modo infinito: reportResult recebe "infinite" como total
- Body type none: bodyBuilder.build chamado com {} e "none"
- Body type json: bodyBuilder.build chamado com campos resolvidos pelo templateEngine
- Content-Type do bodyBuilder adicionado aos headers da request
- Content-Type null: header Content-Type nao setado
- Body passado corretamente para requestExecutor.execute
- Query params: appendados na URL final via URL.searchParams
- Query params vazio: URL nao modificada
- Template resolution: resolveRecord chamado para body e queryParams
- Templates resolvidos N vezes para N requests (2 calls x 3 requests = 6)
- Summary calculation: status 200, 201, 299 = sucesso; 300, 404, 500 = falha
- Status null (erro rede) contado como falha
- 0 requests: avg=0, min=0, max=0 (nao Infinity)
- Todas falhando: summary com 0 sucesso, N falhas, avg correto
- Request options: index, method, url, headers, body, timeoutMs passados corretamente
- Index incremental: 1, 2, 3 para 3 requests
- SIGINT cleanup: listener count antes == listener count depois
- Content-Type precedence: bodyBuilder Content-Type sobrescreve config headers Content-Type

### T10 — run-command (9 testes)
- Happy path: parseConfig retorna config valida, runner.execute retorna summary -> sem exit
- ConfigError: parseConfig lanca ConfigError -> stderr "Error: ...", exit 1
- TemplateError: validateRecord lanca TemplateError -> stderr "Error: ...", exit 1
- Unexpected Error: parseConfig lanca Error generico -> stderr "Unexpected error: ...", exit 1
- Runner.execute chamado com config correto
- validateRecord chamado para body E queryParams (em ordem)
- runner.execute NAO chamado quando parseConfig falha
- runner.execute NAO chamado quando validateRecord falha
- Runner execution error -> exit 1

### T10 — wizard (12 testes)
- Happy path POST: inputs completos -> YAML gerado com method, url, headers, bodyType, body, queryParams, concurrency, total, timeoutMs
- GET: bodyType automaticamente 'none', select de bodyType NAO chamado (apenas 1 select para method)
- DELETE: bodyType automaticamente 'none'
- Confirmacao "Nao" -> writeFile NAO chamado
- YAML gerado por yaml.stringify (nao string manual)
- Preview mostrado entre "--- Preview ---" e "--- Fim ---"
- Output path customizado via opcao -o
- Total "infinite" aceito como string literal no YAML
- Multiplos headers adicionados corretamente
- Multiplos body fields adicionados corretamente
- FormData bodyType configurado corretamente
- Confirmacao "Nao" -> mensagem "Configuracao descartada." exibida

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

### T5

- Coverage (unit): 100% stmts, 100% branches, 100% funcs, 100% lines (above 80% threshold)
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
 5 test files, 92 tests passed

$ pnpm test:coverage
 Coverage report:
 http-client.ts: 100% stmts, 100% branches, 100% funcs, 100% lines
 Summary: 97.5% stmts, 88.67% branches, 100% funcs, 100% lines
```

### T6

- Coverage (unit): 100% stmts, 100% branches, 100% funcs, 100% lines (above 80% threshold)
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
 6 test files, 102 tests passed

$ pnpm test:coverage
 Coverage report:
 body-builder.ts: 100% stmts, 100% branches, 100% funcs, 100% lines
 Summary: 97.7% stmts, 89.28% branches, 100% funcs, 100% lines
```

### T7

- Coverage (unit): 100% stmts, 100% branches, 100% funcs, 100% lines (above 80% threshold)
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
 7 test files, 123 tests passed

$ pnpm test:coverage
 Coverage report:
 executor.ts: 100% stmts, 100% branches, 100% funcs, 100% lines
 Summary: 97.95% stmts, 89.65% branches, 100% funcs, 100% lines
```

### T8

- Coverage (unit): 100% stmts, 91.66% branches, 100% funcs, 100% lines (above 80% threshold)
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
 8 test files, 138 tests passed

$ pnpm test:coverage
 Coverage report:
 reporter.ts: 100% stmts, 91.66% branches, 100% funcs, 100% lines
 Summary: 98.33% stmts, 90% branches, 100% funcs, 100% lines
```

### T9

- Coverage (unit): 96.36% stmts, 95.65% branches, 83.33% funcs, 98.03% lines (above 80% threshold)
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
 9 test files, 167 tests passed

$ pnpm test:coverage
 Coverage report:
 runner.ts: 96.36% stmts, 95.65% branches, 83.33% funcs, 98.03% lines
 Summary: 97.71% stmts, 91.39% branches, 96.15% funcs, 99.39% lines
```

### T10

- Coverage (unit): run-command.ts 100% stmts, 83.33% branches, 100% funcs, 100% lines; wizard.ts 78.26% stmts, 53.33% branches, 33.33% funcs, 80% lines; index.ts 0% (pure wiring). Global: 92.14% stmts, 85.96% branches, 87.09% funcs, 93.53% lines (all above 80% threshold)
- Test command(s): `pnpm build`, `pnpm test`, `pnpm test:coverage`, `node dist/bin/repeater.js --help`, `node dist/bin/repeater.js run --help`, `node dist/bin/repeater.js run tests/fixtures/valid-config.yaml`
- Output/result:

```
$ pnpm build
> repeater@0.1.0 build /home/tiuras/pessoal/repeater
> tsc
(exit code 0)

$ pnpm test
> repeater@0.1.0 test /home/tiuras/pessoal/repeater
> vitest run
 11 test files, 188 tests passed

$ pnpm test:coverage
 Coverage report:
 index.ts: 0% stmts (pure commander wiring)
 run-command.ts: 100% stmts, 83.33% branches, 100% funcs, 100% lines
 wizard.ts: 78.26% stmts, 53.33% branches, 33.33% funcs, 80% lines
 Global Summary: 92.14% stmts, 85.96% branches, 87.09% funcs, 93.53% lines

$ node dist/bin/repeater.js --help
Usage: repeater [options] [command]
HTTP request repeater CLI
Commands: run <file>, init [options]

$ node dist/bin/repeater.js run tests/fixtures/valid-config.yaml
 50 requests executadas (ERR Host nao encontrado -- URL ficticia)
 Summary: Total 50, Success 0, Failures 50
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
# T5:
pnpm test               # 92 tests passed (5 files)
pnpm test:coverage       # 97.5% stmts, 88.67% branches
pnpm build               # OK
git commit -m "feat: add UndiciHttpClient with timeout and network error handling (T5)"
# T6:
pnpm test               # 102 tests passed (6 files)
pnpm test:coverage       # 97.7% stmts, 89.28% branches, 100% funcs, 100% lines
pnpm build               # OK
git commit -m "feat: add DefaultBodyBuilder with json, formdata and none support (T6)"
# T7:
pnpm test               # 123 tests passed (7 files)
pnpm test:coverage       # 97.95% stmts, 89.65% branches, 100% funcs, 100% lines
pnpm build               # OK
git commit -m "feat: add RequestExecutor with TDD tests (T7)"
# T8:
pnpm test               # 138 tests passed (8 files)
pnpm test:coverage       # 98.33% stmts, 90% branches, 100% funcs, 100% lines
pnpm build               # OK
git commit -m "feat: add ConsoleReporter with TDD tests (T8)"
# T9:
pnpm test               # 167 tests passed (9 files)
pnpm test:coverage       # 97.71% stmts, 91.39% branches, 96.15% funcs, 99.39% lines
pnpm build               # OK
git commit -m "feat: add RepeaterRunner with p-limit concurrency and TDD tests (T9)"
# T10:
pnpm test               # 188 tests passed (11 files)
pnpm test:coverage       # 92.14% stmts, 85.96% branches, 87.09% funcs, 93.53% lines
pnpm build               # OK
node dist/bin/repeater.js --help          # OK
node dist/bin/repeater.js run --help      # OK
node dist/bin/repeater.js run tests/fixtures/valid-config.yaml  # OK (50 requests, ERR expected)
git commit -m "feat: add CLI with commander, run command, wizard and entry point (T10)"
```

## Notes

- TypeScript 5.9.3 instalado (spec dizia ^5.7, compativel)
- vitest 4.0.18 instalado (spec dizia v3, versao mais recente disponivel; API compativel)
- zod 4.3.6 instalado (spec dizia v3, versao mais recente disponivel)
- @faker-js/faker 10.3.0, commander 14.0.3, undici 7.22.0, p-limit 7.3.0

## Should-fix corrections (post-review)

### SF1 -- Wizard coverage (branches 53% -> 100%)

Extraidas funcoes `validateUrl` e `validateTotal` de inline lambdas para funcoes nomeadas exportaveis em `src/cli/wizard.ts`. Adicionados 13 testes diretos (5 para validateUrl, 8 para validateTotal) cobrindo: URLs validas/invalidas, strings sem protocolo, strings vazias; total valido/invalido, 0, negativo, decimal, non-numeric, infinite, vazio.

Coverage wizard.ts: 78.26% stmts / 53.33% branches / 33.33% funcs / 80% lines -> **100% / 100% / 100% / 100%**

### SF2 -- CLI index.ts (0% -> 100%)

Criado `tests/unit/cli/index.test.ts` com 5 testes: nome do programa, subcomandos run e init, versao, argumento file do run, opcao --output do init.

Coverage index.ts: 0% -> **100% / 100% / 100% / 100%**

### SF3 -- Exit silencioso para non-Error throws

Adicionado `else { console.error("Unknown error"); }` antes do `process.exit(1)` em `src/cli/run-command.ts`. Adicionados 2 testes: string thrown e number thrown, ambos verificam `console.error("Unknown error")` e `process.exit(1)`.

Coverage run-command.ts: 100% stmts / 83.33% branches -> **100% / 100%**

### SF4 -- Wizard concurrency > total

Adicionado ajuste `if (typeof total === "number" && concurrency > total) { concurrency = total; }` apos coletar total no wizard. Adicionados 3 testes: concurrency > total (clamped), total infinite (not clamped), concurrency <= total (not clamped).

### Post-fix validation

```
$ pnpm build     # OK (exit code 0)
$ pnpm test      # 211 tests passed (12 files)
$ pnpm test:coverage
 Statements: 98.36% (was 92.14%)
 Branches:   93.22% (was 85.96%)
 Functions:  96.77% (was 87.09%)
 Lines:      99.57% (was 93.53%)
 All thresholds >= 80% PASS
```

## Feature: successRange configuravel

### Descricao

Adicionado campo `successRange` configuravel ao YAML do HTTP Repeater para definir quais status codes contam como sucesso. Default: `{ min: 200, max: 299 }` (apenas 2xx, comportamento anterior). Range e inclusive (min <= status <= max).

### Arquivos alterados

- `src/config/types.ts` -- adicionado campo `successRange: { min: number; max: number }` ao `RepeaterConfig`
- `src/config/schema.ts` -- adicionado zod schema para successRange com default, validacao 100-599, e refine min <= max
- `src/runner.ts` -- alterada logica de sucesso de hardcoded `>= 200 && < 300` para `>= config.successRange.min && <= config.successRange.max`
- `src/cli/wizard.ts` -- adicionada pergunta "Customizar range de sucesso?" com inputs para min e max; se nao customizar, successRange nao e incluido no YAML (usa default do schema)
- `tests/unit/config/schema.test.ts` -- 9 testes novos: default, custom, min=max, min>max rejeitado, min<100, max>600, non-integer, boundary 100-599
- `tests/unit/runner.test.ts` -- 4 testes novos: 302 com range {200,399}=sucesso, 302 com default=falha, inclusive boundary, default successRange no makeConfig
- `tests/unit/cli/wizard.test.ts` -- 2 testes novos (default sem customizar, custom com min/max) + todos testes existentes atualizados com mock de confirm de successRange

### Decisoes

- Decisao: Range inclusive (min <= status <= max) em vez de half-open [min, max) -> Motivo: mais intuitivo para o usuario. Se configurar max: 399, status 399 conta como sucesso.
- Decisao: Wizard nao inclui successRange no YAML quando usuario nao customiza -> Motivo: YAML mais limpo, schema aplica default automaticamente.

### Validation evidence

```
$ pnpm build
> repeater@0.1.0 build /home/tiuras/pessoal/repeater
> tsc
(exit code 0)

$ pnpm test
> 12 test files, 229 tests passed (was 215)

$ pnpm test:coverage
 Statements: 98.44% (was 98.36%)
 Branches:   93.49% (was 93.22%)
 Functions:  96.87% (was 96.77%)
 Lines:      99.59% (was 99.57%)
 All thresholds >= 80% PASS
```

### Testes adicionados (14 novos)

**schema.test.ts (9 testes)**:
- Default successRange = { min: 200, max: 299 }
- Custom successRange aceito
- min = max (single status) aceito
- min > max rejeitado
- min < 100 rejeitado
- max > 599 rejeitado
- Non-integer min rejeitado
- Non-integer max rejeitado
- Boundary values min=100, max=599 aceito

**runner.test.ts (4 testes)**:
- Status 302 com successRange {200, 399} conta como sucesso
- Status 302 com default {200, 299} conta como falha
- Max boundary inclusive (299 = sucesso com range {200, 299})
- Default successRange adicionado ao helper makeConfig

**wizard.test.ts (2 novos + 15 atualizados)**:
- Default sem customizar -> successRange nao incluido no YAML
- Custom com min=200 max=399 -> successRange incluido no YAML
- Todos 15 testes existentes atualizados com mock de confirm de successRange

## Handoff para Review

### O que mudou
- Projeto criado do zero com toda infraestrutura de build/test
- T3: Zod schema (repeaterConfigSchema) e YAML config parser (parseConfig) implementados com TDD
- T4: FakerTemplateEngine com resolve, resolveRecord, validateRecord implementados com TDD
- T5: UndiciHttpClient (interface HttpClient + implementacao com undici.request, timeout via AbortSignal, erros de rede) implementado com TDD
- T6: DefaultBodyBuilder (interface BodyBuilder + implementacao json/formdata/none) implementado com TDD
- T7: RequestExecutor (DI de HttpClient, timing com performance.now(), error wrapping, sempre retorna RequestResult) implementado com TDD
- T8: ConsoleReporter (interface Reporter + classe ConsoleReporter com writer injection, reportResult finito/infinito/erro, reportSummary com estatisticas) implementado com TDD
- T9: RepeaterRunner (interface RunnerDeps + classe RepeaterRunner com p-limit concurrency, backpressure para modo infinito, SIGINT handling, counter-based summary, abort()) implementado com TDD
- T10: CLI completa (createProgram com commander, runCommand handler com DI wiring e error handling, wizardCommand com @inquirer/prompts interativo + YAML preview + save, bin/repeater.ts entry point) implementado com TDD

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
- **T5**: src/request/http-client.ts
- **T5**: tests/unit/request/http-client.test.ts
- **T6**: src/request/body-builder.ts
- **T6**: tests/unit/request/body-builder.test.ts
- **T7**: src/request/executor.ts
- **T7**: tests/unit/request/executor.test.ts
- **T8**: src/reporter.ts
- **T8**: tests/unit/reporter.test.ts
- **T9**: src/runner.ts
- **T9**: tests/unit/runner.test.ts
- **T10**: src/cli/index.ts, src/cli/run-command.ts, src/cli/wizard.ts, bin/repeater.ts
- **T10**: tests/unit/cli/run-command.test.ts, tests/unit/cli/wizard.test.ts

### Como testar manualmente
- `pnpm build` deve compilar sem erro
- `pnpm test` deve rodar sem erro (188 testes, exit code 0)
- `pnpm test:coverage` deve passar com coverage >= 80% em todos os thresholds
- `node dist/bin/repeater.js --help` deve mostrar help do CLI
- `node dist/bin/repeater.js run --help` deve mostrar help do run
- `node dist/bin/repeater.js init --help` deve mostrar help do init
- `node dist/bin/repeater.js run tests/fixtures/valid-config.yaml` deve executar (requests falham por URL ficticia, mas sem erros de import/parsing)
- `node dist/bin/repeater.js init` deve iniciar wizard interativo

### Preocupacoes / pontos de atencao
- Versoes de deps sao mais recentes que o spec (vitest 4 vs 3, zod 4 vs 3, etc.) -- APIs compatveis confirmado na T3
- @types/node adicionado como devDep (nao estava no spec original)
- src/cli/index.ts tem 0% coverage individual (puro wiring commander) mas global esta acima de 80% em todos os thresholds
