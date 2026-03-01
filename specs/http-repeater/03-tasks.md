# Tasks — HTTP Repeater

## Contexto herdado

> Resumo das decisoes de Discover + Design que afetam a execucao.
> O implementador vai ler ESTA secao primeiro para entender o projeto.

- **Objetivo da feature**: CLI tool em TypeScript para disparar requests HTTP em massa a partir de configuracao YAML. Suporta JSON e FormData como body, dados dinamicos via faker-js (sintaxe `{{faker.module.method}}`), concorrencia controlada, modo infinito (loop ate Ctrl+C), e output em tempo real no terminal com summary final.

- **Arquitetura escolhida**: 8 modulos com responsabilidade unica, implementados bottom-up: ConfigParser (yaml + zod) -> TemplateEngine (regex + faker) -> HttpClient (undici) -> BodyBuilder (json/formdata) -> RequestExecutor (http-client + timing) -> Reporter (stdout) -> Runner (orquestrador com p-limit) -> CLI (commander + inquirer). Cada modulo expoe uma interface TypeScript para injecao de dependencia e mocking em testes.

- **Contratos definidos**:
  - `RepeaterConfig`: interface principal consumida por todos os modulos (method, url, headers, bodyType, body, queryParams, concurrency, total, timeoutMs)
  - `TemplateEngine`: interface com `validateRecord(fields)`, `resolve(template)`, `resolveRecord(fields)`
  - `HttpClient`: interface que abstrai undici — `execute(options) -> Promise<HttpResponse>`
  - `BodyBuilder`: interface — `build(fields, bodyType) -> { body, contentType }`
  - `Reporter`: interface — `reportResult(result, total)`, `reportSummary(summary)`
  - `Runner`: interface — `execute(config) -> Promise<ExecutionSummary>`
  - `RequestResult`: { index, method, url, status, durationMs, error }
  - `ExecutionSummary`: { totalRequests, successCount, failureCount, avgDurationMs, minDurationMs, maxDurationMs, totalDurationMs }
  - Zod schema: `repeaterConfigSchema` com defaults, enums e refinement (concurrency <= total)

- **Constraints tecnicas**:
  - TypeScript ^5.7, ESM nativo (`"type": "module"` no package.json)
  - Todos os imports com extensao `.js` (ESM requer extensao final)
  - pnpm como package manager
  - vitest v3 com @vitest/coverage-v8, threshold 80% (statements, branches, functions, lines)
  - Build via tsc para `dist/`
  - Node.js >= 20 LTS

- **Edge cases conhecidos**:
  - URL invalida no wizard (rejeitar e pedir novamente)
  - Concorrencia > total (zod refine rejeita; wizard ajusta automaticamente)
  - Body vazio em POST (permitir)
  - Total = 0 (rejeitar, minimo 1 ou "infinite")
  - Arquivo YAML nao encontrado ou com sintaxe invalida
  - Template faker invalido (fail-fast antes de executar qualquer request)
  - Timeout em todas as requests (logar cada uma, summary mostra 100% falha)
  - Mix de texto fixo + template no mesmo campo: `"BR{{faker.string.numeric(11)}}"`
  - Multiplos templates no mesmo campo: `"{{faker.person.firstName}} {{faker.person.lastName}}"`
  - Template com argumentos: `{{faker.string.numeric(5)}}`
  - FormData Content-Type com boundary automatico
  - Modo infinito: SIGINT seta flag, loop para de enfileirar, summary parcial exibido
  - AbortError do undici quando timeout atinge (tratar especificamente)

- **Stack/framework**:
  - undici v7 (HTTP client), @faker-js/faker v9, commander v13, @inquirer/prompts v7, yaml v2, zod v3, p-limit v6
  - vitest v3 + @vitest/coverage-v8 (devDeps)
  - TypeScript ^5.7 (devDep)

## Decisoes de decomposicao

> Por que as tasks foram quebradas desta forma.
> Que trade-offs existem na ordem de execucao.

A decomposicao segue a estrategia **bottom-up** recomendada pelo Design, com 4 fases:

1. **Fase 1 (Fundacao)**: Setup do projeto + types/errors + schema/parser. Sao os alicerces que todas as demais tasks dependem. T1 cria a infraestrutura (pnpm, tsconfig, vitest), T2 define os tipos e erros compartilhados, T3 implementa a validacao de configuracao. Essa sequencia e estritamente ordenada: T2 depende de T1 (precisa do projeto para existir) e T3 depende de T2 (precisa dos tipos para o schema).

2. **Fase 2 (Core engines)**: TemplateEngine, HttpClient e BodyBuilder. Sao modulos independentes entre si — todos dependem apenas dos tipos de T2. Por isso T4, T5 e T6 podem ser implementadas em qualquer ordem ou em paralelo. A decisao de separa-las (em vez de agrupar) e porque cada uma tem complexidade suficiente para merecer sua propria suite de testes: TemplateEngine tem parsing de regex com argumentos, HttpClient tem integracao com undici e timeout, BodyBuilder tem JSON/FormData.

3. **Fase 3 (Orquestracao)**: RequestExecutor, Reporter e Runner. T7 (executor) combina HttpClient + timing e depende de T5. T8 (reporter) depende apenas dos tipos. T9 (runner) e o orquestrador que junta tudo — depende de T4, T6, T7, T8. A decisao de manter RequestExecutor separado do HttpClient (em vez de fundir) e para isolar a logica de timing/retry-handling do transporte HTTP puro, facilitando mocking.

4. **Fase 4 (CLI)**: T10 agrupa commander setup, run command, wizard e entry point. A CLI e a camada mais externa, depende de todo o resto (T3 para parsing, T9 para execucao). Agrupamos em uma unica task porque os componentes CLI sao relativamente simples e fortemente acoplados entre si (o run-command chama o parser e o runner, o wizard gera YAML que o parser valida).

**Trade-off principal**: agrupar a CLI inteira em T10 torna essa task maior que as demais. A alternativa seria separar wizard de run-command, mas isso adicionaria overhead de contexto sem beneficio significativo — o implementador precisaria entender o commander setup de qualquer forma para ambas.

## Task list

### T1 — Setup do projeto

**Descricao**: Inicializar o projeto do zero: criar repositorio git, configurar pnpm com package.json completo, tsconfig.json para ESM + TypeScript, vitest.config.ts com thresholds de coverage, .gitignore, e a estrutura de pastas vazia (src/, tests/, bin/). Ao final, `pnpm test` deve rodar sem erro (mesmo sem testes ainda) e `pnpm build` deve compilar sem erro.

**Dependencias**: Nenhuma (primeira task)

**Arquivos afetados (estimativa)**:
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `.gitignore`
- `src/` (diretorio vazio com subdiretorios: `cli/`, `config/`, `template/`, `request/`)
- `tests/` (diretorio vazio com subdiretorios: `unit/config/`, `unit/template/`, `unit/request/`, `fixtures/`)
- `bin/` (diretorio vazio)

**Criterios de aceite**:
- [ ] `git init` executado, repositorio inicializado
- [ ] `pnpm init` executado, package.json criado
- [ ] package.json contem: `"name": "repeater"`, `"version": "0.1.0"`, `"type": "module"`, campo `"bin"` apontando para `"./dist/bin/repeater.js"`, campo `"engines"` com `"node": ">=20.0.0"`, scripts `build`, `dev`, `test`, `test:watch`, `test:coverage`, `lint`
- [ ] Dependencias de producao instaladas: undici, @faker-js/faker, commander, @inquirer/prompts, yaml, zod, p-limit
- [ ] Dependencias de desenvolvimento instaladas: typescript, vitest, @vitest/coverage-v8
- [ ] tsconfig.json configurado: target ES2022, module NodeNext, moduleResolution NodeNext, outDir ./dist, rootDir ., strict true, esModuleInterop true, skipLibCheck true, declaration true, sourceMap true, include ["src/**/*", "bin/**/*"], exclude ["node_modules", "dist", "tests"]
- [ ] vitest.config.ts configurado com: globals true, coverage provider v8, reporters text + text-summary, thresholds 80% para statements/branches/functions/lines, include src/**/*.ts, exclude src/**/types.ts e src/**/errors.ts
- [ ] .gitignore contem: node_modules/, dist/, coverage/, *.tgz, .DS_Store
- [ ] Estrutura de pastas criada: src/cli/, src/config/, src/template/, src/request/, tests/unit/config/, tests/unit/template/, tests/unit/request/, tests/fixtures/, bin/
- [ ] `pnpm build` executa sem erro (mesmo sem arquivos .ts ainda — tsc nao falha com include vazio)
- [ ] `pnpm test` executa sem erro (vitest roda sem testes e retorna sucesso)

**Edge cases a cobrir**:
- Nenhum edge case de runtime nesta task — e puramente setup de infraestrutura

**Estrategia de testes**:
- Unit: Nao ha codigo para testar nesta task
- Integration: Verificar que `pnpm build` e `pnpm test` rodam sem erro
- O que NAO testar nesta task: Nenhum modulo de negocio existe ainda

**Notas para o implementador**:
- Usar `pnpm init` (nao `npm init`). Se pnpm nao estiver instalado: `npm install -g pnpm`
- O campo `"type": "module"` no package.json e obrigatorio para ESM nativo
- No tsconfig, `"module": "NodeNext"` e `"moduleResolution": "NodeNext"` sao necessarios para ESM com Node.js
- O `rootDir: "."` e necessario porque o entry point esta em `bin/` (fora de `src/`)
- Para que `pnpm build` nao falhe com pastas vazias, pode ser necessario criar um arquivo placeholder (ex: `src/index.ts` com `export {}`) — remover depois quando houver codigo real
- Scripts do package.json conforme Design:
  ```json
  {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "tsc --noEmit"
  }
  ```
- Criar pastas vazias com `mkdir -p`. Git nao rastreia pastas vazias — adicionar `.gitkeep` se necessario, ou deixar que as proximas tasks criem os arquivos

---

### T2 — Config types + Error classes

**Descricao**: Criar todas as interfaces e tipos TypeScript compartilhados do projeto (`RepeaterConfig`, `HttpMethod`, `BodyType`, `RequestTotal`, `RequestResult`, `ExecutionSummary`, `HttpRequestOptions`, `HttpResponse`) e as classes de erro customizadas (`ConfigError`, `TemplateError`). Estes sao os tipos fundamentais que todos os demais modulos importam.

**Dependencias**: T1

**Arquivos afetados (estimativa)**:
- `src/config/types.ts`
- `src/request/types.ts`
- `src/errors.ts`
- `src/template/errors.ts`
- `tests/unit/errors.test.ts`

**Criterios de aceite**:
- [ ] `src/config/types.ts` exporta: `HttpMethod` (union type: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'), `BodyType` (union type: 'json' | 'formdata' | 'none'), `RequestTotal` (number | 'infinite'), `RepeaterConfig` (interface com todos os 9 campos documentados no Design)
- [ ] `src/request/types.ts` exporta: `RequestResult` (interface com index, method, url, status, durationMs, error), `ExecutionSummary` (interface com totalRequests, successCount, failureCount, avgDurationMs, minDurationMs, maxDurationMs, totalDurationMs), `HttpRequestOptions` (interface com url, method, headers, body, timeoutMs), `HttpResponse` (interface com statusCode, headers)
- [ ] `src/errors.ts` exporta: `ConfigError` (extends Error, com name = 'ConfigError')
- [ ] `src/template/errors.ts` exporta: `TemplateError` (extends Error, com name = 'TemplateError')
- [ ] Todas as classes de erro preservam stack trace (chamar `super(message)` e setar `this.name`)
- [ ] Todos os exports usam `export` (nao `export default`) para ESM
- [ ] Todos os imports entre arquivos usam extensao `.js`
- [ ] `pnpm build` compila sem erro
- [ ] Testes passam e coverage dos errors >= 80%

**Edge cases a cobrir**:
- ConfigError e TemplateError devem preservar a mensagem original
- ConfigError e TemplateError devem ser instanciaveis com `new ConfigError("msg")` e detectaveis com `instanceof ConfigError`
- Stack trace deve apontar para o local correto (nao para a classe Error base)

**Estrategia de testes**:
- Unit (escrever ANTES do codigo):
  - `tests/unit/errors.test.ts`: Testar que ConfigError e instanciavel, tem name = 'ConfigError', preserva message, e instanceof Error. Mesmo para TemplateError
  - Testar que `error.stack` contem informacao util (nao esta undefined)
- O que NAO testar nesta task: Tipos TypeScript (types.ts) sao verificados pelo compilador, nao precisam de teste unitario. Nao testar schema zod (e da T3). Nao testar logica de negocio (nao existe ainda)

**Notas para o implementador**:
- Os tipos em `types.ts` sao apenas declaracoes TypeScript (interfaces e types). Nao geram codigo JavaScript. O coverage tool exclui estes arquivos (veja vitest.config.ts: `exclude: ['src/**/types.ts', 'src/**/errors.ts']`), mas os testes das error classes sao obrigatorios
- A exclusao de `errors.ts` do coverage no vitest.config e porque sao classes triviais, mas MESMO ASSIM escrevemos testes para elas — os testes validam o contrato (name, instanceof, message)
- Atencao ao import: `import { ConfigError } from '../errors.js'` (com .js, nao .ts)
- `RepeaterConfig` deve ser uma interface (nao type alias) para permitir extensao futura
- Os tipos de `request/types.ts` importam `HttpMethod` de `config/types.ts` — garantir o import cross-module com extensao .js

---

### T3 — Zod schema + Config parser

**Descricao**: Implementar o schema de validacao zod para o arquivo YAML de configuracao e o ConfigParser que le o YAML do disco, parseia com o pacote `yaml`, valida contra o schema zod, e retorna um `RepeaterConfig` tipado. O parser deve emitir erros claros e especificos para cada tipo de falha (arquivo nao encontrado, YAML invalido, campo obrigatorio ausente, valor fora do range, concurrency > total). Criar tambem os fixtures YAML para testes.

**Dependencias**: T2

**Arquivos afetados (estimativa)**:
- `src/config/schema.ts`
- `src/config/parser.ts`
- `tests/unit/config/schema.test.ts`
- `tests/unit/config/parser.test.ts`
- `tests/fixtures/valid-config.yaml`
- `tests/fixtures/minimal-config.yaml`
- `tests/fixtures/formdata-config.yaml`
- `tests/fixtures/infinite-config.yaml`
- `tests/fixtures/invalid-config.yaml`

**Criterios de aceite**:
- [ ] `src/config/schema.ts` exporta `repeaterConfigSchema` (zod object schema) com todos os campos, defaults, enums e refinement de concurrency <= total
- [ ] Schema aceita config completa (todos os campos) e retorna RepeaterConfig tipado
- [ ] Schema aceita config minima (so method + url) e preenche defaults: headers={}, bodyType='none', body={}, queryParams={}, concurrency=1, total=1, timeoutMs=5000
- [ ] Schema rejeita method invalido (ex: 'INVALID') com mensagem clara
- [ ] Schema rejeita url invalida com mensagem clara
- [ ] Schema rejeita total = 0 ou negativo
- [ ] Schema rejeita concurrency = 0 ou negativo
- [ ] Schema rejeita concurrency > total (quando total e numero) via refinement
- [ ] Schema aceita total = 'infinite' com qualquer concurrency
- [ ] `src/config/parser.ts` exporta funcao `parseConfig(filePath: string): Promise<RepeaterConfig>`
- [ ] Parser le arquivo do disco com `fs.readFile`
- [ ] Parser lanca `ConfigError` com mensagem "Arquivo nao encontrado: <path>" se arquivo nao existe
- [ ] Parser lanca `ConfigError` com detalhes se YAML tem sintaxe invalida
- [ ] Parser lanca `ConfigError` com detalhes dos campos invalidos se schema falha
- [ ] Todos os 5 fixtures YAML criados em `tests/fixtures/`
- [ ] `pnpm test` passa com coverage >= 80% para schema.ts e parser.ts

**Edge cases a cobrir**:
- Arquivo vazio (YAML parseia como null/undefined — deve lancar ConfigError)
- Arquivo com YAML valido mas sem campos obrigatorios (method/url ausentes)
- Campo `total` como string "infinite" (deve aceitar) vs string "abc" (deve rejeitar)
- Campo `total` como numero decimal 3.5 (deve rejeitar — precisa ser inteiro)
- Campo `bodyType` com valor nao reconhecido (ex: 'xml')
- Headers com valores nao-string (ex: numero) — zod deve rejeitar ou converter
- Concurrency = 10, total = 5 (refinement deve falhar)
- Concurrency = 10, total = 'infinite' (refinement deve passar)
- Arquivo com permissao negada (EACCES) — deve lancar ConfigError com mensagem clara

**Estrategia de testes**:
- Unit (escrever ANTES do codigo):
  - `tests/unit/config/schema.test.ts`:
    - Teste happy path: config completa valida -> retorna todos os campos
    - Teste defaults: config minima (so method+url) -> retorna objeto com defaults preenchidos
    - Teste cada enum invalido: method invalido, bodyType invalido
    - Teste url invalida: string que nao e URL
    - Teste total invalido: 0, negativo, decimal, string aleatoria
    - Teste refinement: concurrency > total numerico (rejeita), concurrency qualquer + total infinite (aceita)
    - Teste campos extras: schema deve ignorar campos desconhecidos (passthrough ou strip — definir)
  - `tests/unit/config/parser.test.ts`:
    - Teste happy path: le fixture valid-config.yaml e retorna RepeaterConfig correto
    - Teste config minima: le fixture minimal-config.yaml e retorna com defaults
    - Teste arquivo nao encontrado: path inexistente -> ConfigError
    - Teste YAML invalido: le fixture invalid-config.yaml -> ConfigError
    - Teste arquivo vazio: criar fixture vazio inline (tmpdir) -> ConfigError
  - Fixtures a criar:
    - `valid-config.yaml`: POST com body json, headers, query params, concurrency 5, total 50
    - `minimal-config.yaml`: GET com apenas method e url
    - `formdata-config.yaml`: POST com bodyType formdata e campos com templates faker
    - `infinite-config.yaml`: GET com total infinite
    - `invalid-config.yaml`: YAML valido mas com method invalido e url ausente
- O que NAO testar nesta task: Template validation (e da T4). Execucao de requests. CLI.

**Notas para o implementador**:
- O pacote `yaml` retorna objetos plain JS. Passar diretamente para `repeaterConfigSchema.parse(obj)`. zod cuida da validacao e dos defaults
- Para ler arquivo: `import { readFile } from 'node:fs/promises'` (ESM nativo, nao precisa de extensao .js para node: imports)
- Tratar erro de `readFile`: se `error.code === 'ENOENT'` -> ConfigError com "Arquivo nao encontrado". Se `error.code === 'EACCES'` -> ConfigError com "Sem permissao de leitura"
- Tratar erro do `yaml.parse`: encapsular em try/catch e converter para ConfigError com detalhes da linha
- Tratar erro do `zod.parse`: capturar `ZodError`, formatar `error.issues` em mensagens legiveis, lancar como ConfigError
- O refinement de concurrency > total deve usar `.refine()` (nao `.superRefine()`) como no Design — a mensagem deve indicar claramente o problema
- Atencao: `z.string().url()` do zod valida URLs. Testar se aceita URLs com porta (ex: `http://localhost:3000/api`)
- Fixtures YAML devem conter dados realistas (nao "test" ou "abc")

---

### T4 — Template engine

**Descricao**: Implementar o TemplateEngine que parseia e resolve expressoes `{{faker.*}}` em strings. O engine tem dois modos: `validateRecord` (verifica se os templates sao validos sem gerar valores — fail-fast) e `resolve`/`resolveRecord` (substitui templates por valores gerados via faker). Inclui parsing de argumentos (numeros, strings entre aspas, booleanos). A regex e o algoritmo de resolucao estao documentados no Design.

**Dependencias**: T2

**Arquivos afetados (estimativa)**:
- `src/template/engine.ts`
- `tests/unit/template/engine.test.ts`

**Criterios de aceite**:
- [ ] `src/template/engine.ts` exporta classe `FakerTemplateEngine` que implementa a interface `TemplateEngine`
- [ ] Regex pattern: `/\{\{\s*faker\.([a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)+)(?:\(([^)]*)\))?\s*\}\}/g`
- [ ] `resolve(template)` substitui todas as ocorrencias de `{{faker.*}}` por valores gerados
- [ ] `resolve` retorna string inalterada se nao contem templates
- [ ] `resolve` suporta multiplos templates na mesma string: `"{{faker.person.firstName}} {{faker.person.lastName}}"` -> `"Maria Silva"`
- [ ] `resolve` suporta mix de texto fixo + template: `"BR{{faker.string.numeric(11)}}"` -> `"BR19283746501"`
- [ ] `resolve` suporta templates com argumentos numericos: `{{faker.string.numeric(5)}}` -> chama `faker.string.numeric(5)`
- [ ] `resolve` suporta templates com argumentos string (aspas): `{{faker.string.numeric("5")}}` -> chama `faker.string.numeric("5")`
- [ ] `resolve` suporta templates com argumentos booleanos: `{{faker.datatype.boolean(true)}}` -> chama com booleano
- [ ] `resolve` suporta templates com multiplos argumentos: `{{faker.string.alpha(5, true)}}` -> chama com dois args
- [ ] `resolve` lanca TemplateError se faker path nao existe: `{{faker.naoExiste.metodo}}`
- [ ] `resolve` lanca TemplateError se faker path nao e funcao (ex: `{{faker.phone}}` — phone e um objeto, nao funcao)
- [ ] `resolveRecord(fields)` resolve todos os valores de um Record<string, string> e retorna novo Record
- [ ] `validateRecord(fields)` verifica se todos os templates sao validos SEM gerar valores
- [ ] `validateRecord` lanca TemplateError com detalhes se algum template e invalido
- [ ] `validateRecord` nao gera valores (nao chama funcoes do faker, apenas verifica existencia)
- [ ] `pnpm test` passa com coverage >= 80% para engine.ts

**Edge cases a cobrir**:
- String sem template: `"texto puro"` -> retorna inalterado
- String vazia: `""` -> retorna string vazia
- Template com espacos dentro das chaves: `{{ faker.phone.number }}` -> deve funcionar
- Template com path profundo: `{{faker.string.alpha}}` (2 niveis) -> deve funcionar
- Template com path invalido (modulo existe, metodo nao): `{{faker.phone.naoExiste}}`
- Template com path invalido (modulo nao existe): `{{faker.moduloFake.metodo}}`
- Template com path que aponta para objeto (nao funcao): `{{faker.phone}}` -> TemplateError
- Argumento numerico: `{{faker.string.numeric(5)}}` -> parseArgs retorna [5]
- Argumento string com aspas duplas: `{{faker.string.sample("hello")}}` -> parseArgs retorna ["hello"]
- Argumento string com aspas simples: `{{faker.string.sample('hello')}}` -> parseArgs retorna ["hello"]
- Argumento booleano: `{{faker.datatype.boolean(true)}}` -> parseArgs retorna [true]
- Multiplos argumentos: `{{faker.number.int(1, 100)}}` -> parseArgs retorna [1, 100]
- Argumento vazio: `{{faker.phone.number()}}` (parenteses vazios) -> parseArgs retorna []
- Templates adjacentes sem separador: `{{faker.person.firstName}}{{faker.person.lastName}}` -> resolve ambos
- Record vazio: `resolveRecord({})` -> retorna `{}`
- Record com valores mistos (com e sem template): `{ name: "fixo", phone: "{{faker.phone.number}}" }`

**Estrategia de testes**:
- Unit (escrever ANTES do codigo):
  - `tests/unit/template/engine.test.ts`:
    - Grupo "resolve":
      - Teste string sem template retorna inalterada
      - Teste string vazia retorna vazia
      - Teste template simples (ex: `{{faker.person.firstName}}`) retorna string nao vazia
      - Teste template com argumentos numericos gera valor
      - Teste template com argumentos string gera valor
      - Teste multiplos templates na mesma string resolve todos
      - Teste texto fixo + template concatena corretamente
      - Teste template com espacos nas chaves funciona
      - Teste template invalido (path nao existe) lanca TemplateError
      - Teste template que aponta para objeto (nao funcao) lanca TemplateError
    - Grupo "resolveRecord":
      - Teste record vazio retorna vazio
      - Teste record com mix de fixo e template resolve corretamente
      - Teste record com template invalido lanca TemplateError
    - Grupo "validateRecord":
      - Teste record com templates validos nao lanca erro
      - Teste record com template invalido lanca TemplateError
      - Teste record sem templates nao lanca erro
      - Teste validateRecord NAO gera valores (verificar que faker methods nao sao chamados — usar spy)
    - Grupo "parseArgs" (funcao interna, testar via resolve):
      - Teste argumento numerico e passado como number
      - Teste argumento string entre aspas e passado como string
      - Teste argumento booleano e passado como boolean
      - Teste multiplos argumentos separados por virgula
- O que NAO testar nesta task: Integracao com ConfigParser. Integracao com BodyBuilder. CLI.

**Notas para o implementador**:
- A regex deve usar flag `g` para encontrar TODAS as ocorrencias via `String.prototype.replace`
- Ao usar regex com flag `g` e `replace`, cada match e substituido independentemente — perfeito para o caso de uso
- A funcao `parseArgs` e interna (nao exportada), mas deve ser testada indiretamente via `resolve` com templates que tem argumentos
- Para `validateRecord`: navegar o objeto faker sem chamar a funcao final. Verificar que `typeof current === 'function'` para o ultimo nivel do path. NAO chamar a funcao — apenas validar existencia
- Cuidado: faker exporta um objeto `faker` default com locale en. Import: `import { faker } from '@faker-js/faker'`
- O `resolve` deve sempre retornar `String(result)` do faker call, pois alguns metodos retornam numeros
- Para testar que `validateRecord` nao gera valores, usar `vi.spyOn(faker.phone, 'number')` e verificar que nao foi chamado
- Atencao: a regex do Design usa `[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)+` para o path, garantindo pelo menos 2 niveis (module.method). `{{faker.phone}}` sozinho NAO da match na regex (so 1 nivel apos faker.), o que e correto pois `faker.phone` e um objeto, nao funcao

---

### T5 — HttpClient (undici)

**Descricao**: Implementar a interface `HttpClient` e sua implementacao `UndiciHttpClient` que usa `undici.request()` para disparar requests HTTP. O client deve suportar timeout via `AbortSignal.timeout()`, enviar headers, body (string ou FormData), e retornar `HttpResponse` com statusCode e headers. Erros de rede e timeout devem ser capturados e re-lancados de forma padronizada.

**Dependencias**: T2

**Arquivos afetados (estimativa)**:
- `src/request/http-client.ts`
- `tests/unit/request/http-client.test.ts`

**Criterios de aceite**:
- [ ] `src/request/http-client.ts` exporta interface `HttpClient` e classe `UndiciHttpClient` que a implementa
- [ ] `UndiciHttpClient.execute(options)` usa `undici.request()` com url, method, headers, body e signal (AbortSignal.timeout)
- [ ] Retorna `HttpResponse` com statusCode e headers parseados
- [ ] Em caso de timeout (AbortError), lanca erro com mensagem descritiva: `"Timeout de ${timeoutMs}ms excedido"`
- [ ] Em caso de erro de rede (ECONNREFUSED, ENOTFOUND, etc.), lanca erro com mensagem descritiva incluindo o code do erro
- [ ] Headers da resposta sao convertidos para Record<string, string>
- [ ] Body da request e passado diretamente para undici (string para JSON, FormData para formdata)
- [ ] O response body e consumido (`.body.dump()` ou `.body.text()`) para liberar a conexao no pool do undici
- [ ] `pnpm test` passa com coverage >= 80% para http-client.ts

**Edge cases a cobrir**:
- Timeout excedido -> erro claro com duracao
- Erro de conexao (ECONNREFUSED) -> erro com detalhes do host/porta
- Erro de DNS (ENOTFOUND) -> erro com hostname
- Headers de resposta com valores undefined (alguns headers podem nao existir)
- Body null (GET request sem body) -> undici deve aceitar
- Body FormData -> undici deve enviar corretamente com multipart boundary
- Status codes variados: 200, 201, 400, 404, 500 -> todos retornados normalmente (nao e erro do client)

**Estrategia de testes**:
- Unit (escrever ANTES do codigo):
  - `tests/unit/request/http-client.test.ts`:
    - Mockar `undici.request` com `vi.mock('undici')` para nao fazer requests reais
    - Teste happy path: mock retorna statusCode 200 e headers -> execute retorna HttpResponse correto
    - Teste com body string (JSON) -> verifica que undici.request recebe body como string
    - Teste com body null (GET) -> verifica que undici.request recebe body undefined/null
    - Teste timeout: mock lanca AbortError -> execute lanca erro com mensagem "Timeout de Xms excedido"
    - Teste erro de rede: mock lanca Error com code ECONNREFUSED -> execute lanca erro com mensagem descritiva
    - Teste erro de DNS: mock lanca Error com code ENOTFOUND -> execute lanca erro com mensagem descritiva
    - Teste que AbortSignal.timeout e chamado com o timeoutMs correto
    - Teste que response body e consumido (verificar que `.body.dump()` ou `.body.text()` e chamado)
- O que NAO testar nesta task: Requests HTTP reais (isso seria teste de integracao). FormData building (e da T6). Template resolution.

**Notas para o implementador**:
- Import: `import { request } from 'undici'`. Usar a funcao `request` diretamente, nao `fetch`
- Timeout: usar `signal: AbortSignal.timeout(options.timeoutMs)` — nativo do Node.js 20+, nao precisa de AbortController manual
- Ao detectar AbortError: `if (error.name === 'AbortError')` — nao usar `instanceof` pois AbortError pode vir de diferentes contextos
- IMPORTANTE: o response body do undici DEVE ser consumido, mesmo que nao usemos o conteudo. Caso contrario, a conexao nao e devolvida ao pool. Usar `await response.body.dump()` para descartar o body rapidamente
- Headers de resposta do undici sao um objeto que pode ter arrays (ex: set-cookie). Para simplificar, converter para Record<string, string> usando o primeiro valor se for array
- Para mockar undici nos testes: `vi.mock('undici', () => ({ request: vi.fn() }))`. Configurar o mock para retornar `{ statusCode: 200, headers: {}, body: { dump: vi.fn() } }`
- FormData com undici: undici aceita `body: formData` nativamente (a partir do v5+). O Content-Type com boundary e setado automaticamente pelo undici quando body e FormData

---

### T6 — BodyBuilder

**Descricao**: Implementar o `BodyBuilder` que recebe campos (Record<string, string>) ja com templates resolvidos e o bodyType, e retorna o body serializado e o Content-Type correspondente. Para JSON: `JSON.stringify(fields)` + `application/json`. Para FormData: cria `FormData` populado + `null` (Content-Type setado automaticamente). Para `none`: retorna null/null.

**Dependencias**: T2

**Arquivos afetados (estimativa)**:
- `src/request/body-builder.ts`
- `tests/unit/request/body-builder.test.ts`

**Criterios de aceite**:
- [ ] `src/request/body-builder.ts` exporta interface `BodyBuilder` e classe `DefaultBodyBuilder` que a implementa
- [ ] `build(fields, 'json')` retorna `{ body: JSON.stringify(fields), contentType: 'application/json' }`
- [ ] `build(fields, 'formdata')` retorna `{ body: FormData populado, contentType: null }` (Content-Type sera setado automaticamente pelo HTTP client com boundary)
- [ ] `build(fields, 'none')` retorna `{ body: null, contentType: null }`
- [ ] `build({}, 'json')` retorna `{ body: '{}', contentType: 'application/json' }` (body JSON vazio e valido)
- [ ] `build({}, 'formdata')` retorna `{ body: FormData vazio, contentType: null }` (FormData vazio e valido)
- [ ] FormData e populado com `formData.append(key, value)` para cada campo
- [ ] `pnpm test` passa com coverage >= 80% para body-builder.ts

**Edge cases a cobrir**:
- Campos vazios com bodyType 'json' -> retorna '{}'
- Campos vazios com bodyType 'formdata' -> retorna FormData vazio (sem campos)
- Campos vazios com bodyType 'none' -> retorna null
- Campos com valores que contem caracteres especiais (aspas, newlines) -> JSON.stringify escapa corretamente
- Campos com valores unicode -> tanto JSON quanto FormData devem preservar
- bodyType 'none' com campos nao-vazios -> ignora campos, retorna null (body type tem precedencia)

**Estrategia de testes**:
- Unit (escrever ANTES do codigo):
  - `tests/unit/request/body-builder.test.ts`:
    - Grupo "json":
      - Teste com campos -> retorna JSON stringified e contentType application/json
      - Teste com campos vazios -> retorna '{}' e contentType application/json
      - Teste com caracteres especiais -> JSON.stringify escapa corretamente
    - Grupo "formdata":
      - Teste com campos -> retorna FormData com campos populados e contentType null
      - Teste com campos vazios -> retorna FormData vazio e contentType null
      - Verificar que FormData.append foi chamado para cada campo (usar `formData.get(key)`)
    - Grupo "none":
      - Teste -> retorna body null e contentType null
      - Teste com campos nao-vazios + bodyType none -> ignora campos, retorna null
- O que NAO testar nesta task: Template resolution nos campos (ja resolvidos antes de chegar aqui). HTTP requests. Integracao com undici.

**Notas para o implementador**:
- Usar `globalThis.FormData` (disponivel nativamente desde Node 18) — nao precisa de pacote externo
- Para FormData, Content-Type deve ser null (nao setar manualmente). O undici vai adicionar `multipart/form-data; boundary=...` automaticamente. Se voce setar Content-Type manualmente para FormData, o boundary vai faltar e a request vai quebrar
- JSON.stringify de um Record<string, string> sempre produz um JSON valido — nao precisa de tratamento especial
- A interface BodyBuilder deve retornar `{ body: string | FormData | null; contentType: string | null }` conforme Design
- Para testar FormData nos testes: instanciar FormData real e verificar com `formData.get('key')` que os valores foram adicionados

---

### T7 — RequestExecutor

**Descricao**: Implementar o `RequestExecutor` que combina o `HttpClient` com logica de timing. Recebe index, method, url, headers, body, timeout — dispara a request via HttpClient, mede o tempo de execucao com `performance.now()`, e retorna um `RequestResult` padronizado. Erros do HttpClient (timeout, rede) sao capturados e convertidos em RequestResult com status null e mensagem de erro.

**Dependencias**: T5

**Arquivos afetados (estimativa)**:
- `src/request/executor.ts`
- `tests/unit/request/executor.test.ts`

**Criterios de aceite**:
- [ ] `src/request/executor.ts` exporta classe `RequestExecutor` que recebe `HttpClient` via construtor (dependency injection)
- [ ] `execute(options)` recebe: `{ index, method, url, headers, body, timeoutMs }` e retorna `Promise<RequestResult>`
- [ ] Em caso de sucesso: retorna `RequestResult` com status = statusCode, durationMs = tempo real, error = null
- [ ] Em caso de timeout: retorna `RequestResult` com status = null, durationMs = tempo real, error = mensagem do timeout
- [ ] Em caso de erro de rede: retorna `RequestResult` com status = null, durationMs = tempo real, error = mensagem do erro
- [ ] durationMs e medido com `performance.now()` (antes e depois da chamada ao HttpClient)
- [ ] O executor NAO lanca excecoes — sempre retorna RequestResult (erros sao capturados)
- [ ] O executor NAO conhece templates, config ou body building — recebe tudo pronto
- [ ] `pnpm test` passa com coverage >= 80% para executor.ts

**Edge cases a cobrir**:
- Request com sucesso (200) -> RequestResult com status 200, error null
- Request com status de erro HTTP (400, 404, 500) -> RequestResult com status correto, error null (nao e erro do executor)
- Request com timeout -> RequestResult com status null, error com mensagem de timeout
- Request com erro de rede -> RequestResult com status null, error com mensagem de rede
- Request muito rapida (< 1ms) -> durationMs deve ser >= 0
- durationMs deve refletir tempo real (nao hardcoded)

**Estrategia de testes**:
- Unit (escrever ANTES do codigo):
  - `tests/unit/request/executor.test.ts`:
    - Criar mock do HttpClient (nao usar UndiciHttpClient real)
    - Teste happy path: httpClient.execute retorna { statusCode: 200, headers: {} } -> RequestResult com status 200, error null, durationMs > 0
    - Teste status 500: httpClient.execute retorna { statusCode: 500, headers: {} } -> RequestResult com status 500, error null
    - Teste timeout: httpClient.execute lanca Error com mensagem de timeout -> RequestResult com status null, error contendo "Timeout"
    - Teste erro de rede: httpClient.execute lanca Error com mensagem ECONNREFUSED -> RequestResult com status null, error contendo a mensagem
    - Teste que durationMs e positivo em todos os cenarios
    - Teste que index e method sao propagados corretamente no RequestResult
    - Teste que url e propagada corretamente no RequestResult
- O que NAO testar nesta task: HttpClient real (undici). Template resolution. Body building.

**Notas para o implementador**:
- O RequestExecutor e deliberadamente "burro" — recebe tudo pronto (url montada, body construido, headers prontos) e so dispara + mede tempo
- Usar `performance.now()` (import de `node:perf_hooks` ou usar global disponivel no Node.js) para timing preciso
- O try/catch deve envolver TODA a chamada ao httpClient.execute. Qualquer excecao vira um RequestResult com error
- NAO re-lancar excecoes. O contrato e: sempre retorna RequestResult, nunca lanca
- O mock do HttpClient para testes: criar um objeto que implementa a interface `{ execute: vi.fn() }`. Configurar retorno com `mockResolvedValue` ou `mockRejectedValue`

---

### T8 — Reporter

**Descricao**: Implementar o `Reporter` que formata e imprime resultados de requests no stdout. Cada request e exibida como `[index/total] METHOD status_code durationMs` (modo finito) ou `[index] METHOD status_code durationMs` (modo infinito). Requests com erro exibem `ERR` em vez do status code. Ao final, imprime summary com estatisticas (total, sucesso, falha, avg/min/max duration, tempo total). Erros de configuracao vao para stderr.

**Dependencias**: T2

**Arquivos afetados (estimativa)**:
- `src/reporter.ts`
- `tests/unit/reporter.test.ts`

**Criterios de aceite**:
- [ ] `src/reporter.ts` exporta interface `Reporter` e classe `ConsoleReporter` que a implementa
- [ ] `ConsoleReporter` recebe writer functions via construtor para facilitar testes: `{ stdout: (msg: string) => void, stderr: (msg: string) => void }` com defaults para `console.log` e `console.error`
- [ ] `reportResult(result, total)` com total numerico formata: `[1/50] POST https://api.com 201 320ms`
- [ ] `reportResult(result, 'infinite')` formata: `[1] POST https://api.com 201 320ms`
- [ ] `reportResult` com erro (status null) formata: `[3/50] POST https://api.com ERR Timeout de 5000ms excedido`
- [ ] `reportSummary(summary)` imprime bloco formatado com: total requests, sucesso, falhas, avg duration, min duration, max duration, tempo total
- [ ] Output vai para stdout (via writer function)
- [ ] `pnpm test` passa com coverage >= 80% para reporter.ts

**Edge cases a cobrir**:
- Result com status null e error string -> exibe ERR + mensagem
- Result com status 2xx -> exibe status code normalmente
- Result com status 4xx/5xx -> exibe status code normalmente (nao e "ERR" — HTTP errors sao responses validas)
- Summary com 0 requests (edge: SIGINT antes de qualquer request completar) -> deve exibir zeros sem erro (division by zero no avg)
- Summary com todas as requests falhando -> successCount 0, failureCount = total
- Total infinito no reportResult -> formato sem /total
- URL muito longa -> nao truncar (exibir completa)
- durationMs com decimais -> formatar como inteiro (Math.round) para legibilidade

**Estrategia de testes**:
- Unit (escrever ANTES do codigo):
  - `tests/unit/reporter.test.ts`:
    - Criar ConsoleReporter com writer mock: `const output: string[] = []; const writer = (msg: string) => output.push(msg)`
    - Grupo "reportResult":
      - Teste modo finito: result com status 200, total 50 -> output contem `[1/50]`, `POST`, `200`, `ms`
      - Teste modo infinito: result com status 200, total 'infinite' -> output contem `[1]`, sem barra
      - Teste com erro: result com status null, error "Timeout" -> output contem `ERR`, "Timeout"
      - Teste com status 4xx: result com status 404 -> output contem `404` (nao ERR)
    - Grupo "reportSummary":
      - Teste summary completo: verifica que contem total, sucesso, falhas, avg, min, max, tempo total
      - Teste summary com 0 requests: nao lanca erro, exibe zeros
      - Teste summary com todas as falhas: successCount 0
    - Grupo "formatacao":
      - Teste que durationMs e exibido como inteiro
      - Teste que method e exibido em uppercase
- O que NAO testar nesta task: Integracao com Runner. Geracao de RequestResult. SIGINT handling.

**Notas para o implementador**:
- O Reporter NAO acumula resultados — apenas formata e imprime. O acumulo para o summary e responsabilidade do Runner
- Para facilitar testes, o construtor aceita writer functions em vez de usar console.log diretamente. Default: `{ stdout: console.log, stderr: console.error }`
- Cuidado com division by zero no avgDurationMs quando totalRequests = 0. Usar `totalRequests > 0 ? sumDuration / totalRequests : 0`
- Formato sugerido para o summary:
  ```
  --- Summary ---
  Total:    50
  Success:  45 (90.0%)
  Failures: 5 (10.0%)
  Avg:      320ms
  Min:      120ms
  Max:      890ms
  Duration: 12.5s
  --- End ---
  ```
- O tempo total no summary (totalDurationMs) e passado pelo Runner, nao calculado pelo Reporter
- Para porcentagem: `(count / total * 100).toFixed(1)%`. Se total = 0, exibir `0.0%`

---

### T9 — Runner (orquestrador)

**Descricao**: Implementar o `Runner` — orquestrador principal que recebe `RepeaterConfig` e coordena a execucao: cria fila de concorrencia via p-limit, itera de 1 ate total (ou infinitamente), para cada iteracao resolve templates (TemplateEngine), constroi body (BodyBuilder), monta URL com query params, dispara request (RequestExecutor), reporta resultado (Reporter). Gerencia SIGINT para modo infinito (seta flag, para de enfileirar, exibe summary parcial). Retorna ExecutionSummary ao final.

**Dependencias**: T4, T6, T7, T8

**Arquivos afetados (estimativa)**:
- `src/runner.ts`
- `tests/unit/runner.test.ts`

**Criterios de aceite**:
- [ ] `src/runner.ts` exporta classe `RepeaterRunner` que recebe `RunnerDeps` via construtor (templateEngine, requestExecutor, bodyBuilder, reporter)
- [ ] `execute(config)` retorna `Promise<ExecutionSummary>`
- [ ] Usa p-limit com `config.concurrency` para controlar concorrencia
- [ ] Para cada request: resolve templates do body, resolve templates dos queryParams, constroi body via BodyBuilder, monta URL com query params resolvidos, dispara via RequestExecutor
- [ ] Query params resolvidos sao appendados na URL via `URL` + `URLSearchParams`
- [ ] Headers da config sao passados para cada request, com Content-Type adicionado se BodyBuilder retornar contentType
- [ ] Cada resultado e reportado via Reporter.reportResult
- [ ] Ao final de todas as requests (ou SIGINT): chama Reporter.reportSummary com ExecutionSummary calculado
- [ ] ExecutionSummary e calculado a partir de contadores (nao de array acumulado): totalRequests, successCount (status 2xx), failureCount, avg/min/max durationMs, totalDurationMs
- [ ] Modo finito: loop de 1 ate config.total, retorna quando todas completam
- [ ] Modo infinito (total = 'infinite'): loop indefinido, para quando flag `aborted` e setada via SIGINT
- [ ] SIGINT handler: `process.on('SIGINT', ...)` seta flag `aborted = true`, loop para de enfileirar novas requests, requests em voo completam, summary parcial e exibido
- [ ] Sucesso e definido como status >= 200 e < 300. Todo o resto (status null, 4xx, 5xx) e contado como falha
- [ ] `pnpm test` passa com coverage >= 80% para runner.ts

**Edge cases a cobrir**:
- Concurrency = 1 -> requests executadas sequencialmente (uma por vez)
- Concurrency = total -> todas disparadas ao mesmo tempo
- Total = 1 -> unica request, summary exibido
- Total = 'infinite' com SIGINT apos 3 requests -> summary mostra 3 requests
- Config sem body (bodyType 'none') -> BodyBuilder retorna null, request sem body
- Config sem queryParams (vazio) -> URL nao modificada
- Config com queryParams que contem templates -> templates resolvidos antes de appendar na URL
- Config com headers que ja contem Content-Type + BodyBuilder retorna contentType -> Content-Type do BodyBuilder tem precedencia
- Todas as requests falham (timeout) -> summary com 0 sucesso, N falhas
- Request muito rapida + muitas concorrentes -> p-limit deve respeitar o limite

**Estrategia de testes**:
- Unit (escrever ANTES do codigo):
  - `tests/unit/runner.test.ts`:
    - Criar mocks para todas as dependencias: templateEngine (resolveRecord retorna campos fixos, validateRecord nao lanca), bodyBuilder (retorna body fixo), requestExecutor (retorna RequestResult fixo), reporter (captura chamadas)
    - O Runner recebe `RunnerDeps { templateEngine, requestExecutor, bodyBuilder, reporter }`. O requestExecutor ja encapsula o HttpClient — o Runner nao conhece HttpClient diretamente
    - Teste happy path (finito): config com total=3, concurrency=1 -> execute retorna summary com 3 requests, reporter.reportResult chamado 3 vezes, reporter.reportSummary chamado 1 vez
    - Teste concorrencia: config com total=5, concurrency=2 -> verificar que no maximo 2 estao em voo simultaneamente (contar chamadas pendentes)
    - Teste modo infinito + abort: config com total='infinite', simular abort apos N chamadas -> summary parcial retornado
    - Teste sem body: config com bodyType='none' -> bodyBuilder.build chamado com fields vazio e 'none'
    - Teste com queryParams: config com queryParams -> URL final contem query string
    - Teste com queryParams com templates: verificar que templateEngine.resolveRecord e chamado para queryParams
    - Teste summary calculation: verificar que successCount conta apenas status 2xx, failureCount conta o resto
    - Teste que Content-Type do bodyBuilder e adicionado aos headers
    - Teste com todas as requests falhando: summary correto com 0 sucesso
- O que NAO testar nesta task: Requests HTTP reais. Template resolution real (usar mocks). Body building real (usar mocks). Formatacao do reporter (usar mock). CLI.

**Notas para o implementador**:
- **RunnerDeps atualizado**: incluir `requestExecutor` no lugar de `httpClient` para facilitar mocking. O Runner nao precisa instanciar RequestExecutor — recebe pronto. Isso difere ligeiramente do Design original mas e mais testavel. A composicao (httpClient -> requestExecutor) e feita na CLI (T10) que monta as dependencias
- p-limit: `import pLimit from 'p-limit'`. Criar `const limit = pLimit(config.concurrency)`. Enfileirar cada request com `limit(() => executeOneRequest(i))`
- Para modo finito: usar `await Promise.all(promises)` onde promises e um array de limit wrappers
- Para modo infinito: usar um while loop `while (!aborted)` que cria promises via limit. NAO acumular todas as promises em array (memoria). Usar um Set de promises pendentes e remover ao completar
- SIGINT: registrar handler com `process.on('SIGINT', () => { aborted = true })`. IMPORTANTE: remover o handler quando a execucao terminar com `process.removeListener` para evitar leak em testes
- Para montar URL com query params: `const url = new URL(config.url); for (const [k, v] of Object.entries(resolvedParams)) { url.searchParams.append(k, v); } url.toString()`
- NAO acumular RequestResults em array para o summary (memoria em modo infinito). Manter apenas contadores: totalRequests++, successCount++, sumDuration+=, minDuration = Math.min(), maxDuration = Math.max()
- Para testar SIGINT nos testes: nao usar process.emit('SIGINT') — em vez disso, expor o flag aborted ou um metodo `abort()` na classe para testes, ou mockar process.on
- Definicao de sucesso: `result.status !== null && result.status >= 200 && result.status < 300`

---

### T10 — CLI completa (commander + wizard + entry point)

**Descricao**: Implementar toda a camada CLI: (1) setup do commander com comandos `init` e `run`, (2) handler do comando `run` que parseia config, valida templates, monta dependencias e executa o Runner, (3) wizard interativo com @inquirer/prompts que coleta inputs do usuario e gera YAML, (4) entry point `bin/repeater.ts` com shebang. Ao final, `repeater run config.yaml` deve funcionar end-to-end e `repeater init` deve gerar um YAML valido via wizard.

**Dependencias**: T3, T9

**Arquivos afetados (estimativa)**:
- `src/cli/index.ts`
- `src/cli/run-command.ts`
- `src/cli/wizard.ts`
- `bin/repeater.ts`
- `tests/unit/cli/run-command.test.ts`
- `tests/unit/cli/wizard.test.ts`

**Criterios de aceite**:
- [ ] `src/cli/index.ts` exporta funcao `createProgram()` que retorna `commander.Command` com comandos `init` e `run` registrados
- [ ] Comando `run <file>` aceita argumento obrigatorio (path do arquivo YAML)
- [ ] Comando `init` aceita opcao `-o, --output <path>` com default `repeater.yaml`
- [ ] `src/cli/run-command.ts` exporta handler que: (1) chama parseConfig, (2) chama templateEngine.validateRecord em body e queryParams, (3) monta RunnerDeps com implementacoes reais, (4) chama runner.execute, (5) exit code 0 se ok, exit code 1 se erro de config/template
- [ ] Erros de config/template sao impressos no stderr com mensagem clara e process.exit(1)
- [ ] `src/cli/wizard.ts` exporta funcao que coleta via @inquirer/prompts: method (select), url (input com validacao), headers (loop confirm+input), bodyType (select, so se method != GET), body fields (loop confirm+input), queryParams (loop confirm+input), concurrency (number), total (input: numero ou "infinite"), timeout (number, default 5000)
- [ ] Wizard exibe preview do YAML gerado e pede confirmacao antes de salvar
- [ ] Wizard salva arquivo YAML no path indicado (opcao -o ou default)
- [ ] Wizard rejeita URL invalida e pede novamente
- [ ] `bin/repeater.ts` contem shebang `#!/usr/bin/env node` e importa/executa createProgram
- [ ] `pnpm build` compila tudo para dist/, incluindo dist/bin/repeater.js
- [ ] `node dist/bin/repeater.js run tests/fixtures/valid-config.yaml` executa sem erro de importacao (pode falhar na request se URL e ficticia, mas nao deve falhar em imports)
- [ ] `pnpm test` passa com coverage >= 80% para cli/run-command.ts e cli/wizard.ts

**Edge cases a cobrir**:
- `repeater run` sem argumento -> commander mostra erro e help
- `repeater run arquivo-que-nao-existe.yaml` -> ConfigError, stderr, exit 1
- `repeater run config-com-template-invalido.yaml` -> TemplateError, stderr, exit 1
- `repeater init` com path que ja existe -> wizard deve perguntar se quer sobrescrever (confirm)
- Wizard: URL invalida -> rejeitar, pedir novamente
- Wizard: concurrency 0 -> rejeitar, pedir novamente (minimo 1)
- Wizard: total 0 -> rejeitar, pedir novamente
- Wizard: total "infinite" -> aceitar como string literal
- Wizard: body type perguntado apenas se method != GET (para GET, bodyType e automaticamente 'none')
- Wizard: usuario cancela (Ctrl+C durante wizard) -> sair sem erro
- Wizard: confirmacao "Nao" -> exibir "Configuracao descartada." e sair

**Estrategia de testes**:
- Unit (escrever ANTES do codigo):
  - `tests/unit/cli/run-command.test.ts`:
    - Mockar parseConfig, TemplateEngine, Runner para isolar o handler
    - Teste happy path: parseConfig retorna config valida, runner.execute retorna summary -> exit 0
    - Teste config invalida: parseConfig lanca ConfigError -> stderr recebe mensagem, exit 1
    - Teste template invalido: templateEngine.validateRecord lanca TemplateError -> stderr recebe mensagem, exit 1
    - Teste que runner.execute e chamado com RunnerDeps corretos
  - `tests/unit/cli/wizard.test.ts`:
    - Mockar @inquirer/prompts (vi.mock) para simular inputs do usuario
    - Teste happy path: simular inputs completos -> verifica que YAML gerado contem todos os campos
    - Teste URL invalida: simular URL invalida -> verifica que validacao rejeita
    - Teste body type omitido para GET: simular GET -> verifica que bodyType = 'none'
    - Teste confirmacao "Nao": simular "Nao" na confirmacao -> verifica que arquivo NAO e salvo
    - Teste que arquivo YAML e escrito no disco (mockar writeFile)
  - Nao testar o commander parsing em si (framework de terceiro) — testar os handlers
- O que NAO testar nesta task: Integracao end-to-end completa (requests HTTP reais). Formatacao do reporter (ja testado em T8).

**Notas para o implementador**:
- **Composicao de dependencias no run-command**: e aqui que montamos o "wiring" do DI:
  ```typescript
  const templateEngine = new FakerTemplateEngine();
  const httpClient = new UndiciHttpClient();
  const requestExecutor = new RequestExecutor(httpClient);
  const bodyBuilder = new DefaultBodyBuilder();
  const reporter = new ConsoleReporter();
  const runner = new RepeaterRunner({ templateEngine, requestExecutor, bodyBuilder, reporter });
  ```
- **ESM imports**: todos com extensao .js. Ex: `import { parseConfig } from '../config/parser.js'`
- **bin/repeater.ts**: deve ter exatamente:
  ```typescript
  #!/usr/bin/env node
  import { createProgram } from '../src/cli/index.js';
  createProgram().parse();
  ```
- **Wizard e @inquirer/prompts**: importar funcoes individuais: `import { select, input, confirm, number } from '@inquirer/prompts'`
- **YAML generation no wizard**: usar `import { stringify } from 'yaml'` para serializar o objeto config em YAML. Nao construir YAML manualmente como string
- **Wizard body type**: para metodos GET e DELETE, pular a pergunta de bodyType e setar automaticamente como 'none'. Para POST, PUT, PATCH, perguntar
- **Wizard loops (headers, body fields, query params)**: usar loop `while (await confirm({ message: 'Adicionar campo?' }))` para permitir adicionar multiplos itens
- **Preview no wizard**: imprimir o YAML gerado com delimitadores visuais: `--- Preview ---\n${yamlString}\n--- Fim ---`
- **Error handling no run-command**: usar try/catch abrangente. Se erro e ConfigError ou TemplateError, imprimir mensagem no stderr e exit(1). Se erro inesperado, imprimir stack no stderr e exit(1)
- **Mockar @inquirer/prompts nos testes**: `vi.mock('@inquirer/prompts', () => ({ select: vi.fn(), input: vi.fn(), confirm: vi.fn(), number: vi.fn() }))`. Configurar retornos em sequencia com `mockResolvedValueOnce`
- **Mockar fs.writeFile nos testes do wizard**: para verificar que o YAML e escrito corretamente sem tocar o disco

## Ordem de execucao recomendada

1. **T1** (Setup) — primeiro, obrigatorio. Sem isso nada funciona
2. **T2** (Types + Errors) — segundo, obrigatorio. Define os tipos que todo o resto usa
3. **T3** (Schema + Parser) — terceiro. Pode ser em paralelo com T4/T5/T6, mas recomendo antes pois as fixtures YAML criadas aqui sao uteis para testes manuais depois
4. **T4, T5, T6** (Template, HttpClient, BodyBuilder) — podem ser implementadas em **paralelo** pois nao dependem entre si, apenas de T2. Se sequencial, a ordem sugerida e T4 -> T5 -> T6 (template engine tem mais edge cases e e mais critica)
5. **T7** (RequestExecutor) — depende de T5. Pode ser em paralelo com T4/T6 se T5 ja estiver pronta
6. **T8** (Reporter) — depende apenas de T2. Pode ser implementada em qualquer momento apos T2, inclusive em paralelo com T4-T7. Colocada aqui por afinidade logica com a fase 3
7. **T9** (Runner) — depende de T4, T6, T7, T8. So pode comecar quando todas as 4 estiverem prontas
8. **T10** (CLI) — depende de T3 e T9. Ultima task. Integra tudo

**Resumo visual**:
```
T1 -> T2 -> T3 -----------------> T10
        |                           ^
        +-> T4 ------+             |
        |             |             |
        +-> T5 -> T7 +-> T9 ------+
        |             |
        +-> T6 ------+
        |
        +-> T8 ------+
```

## Risks & mitigations

- **Risco**: Template regex nao cobre edge case com parenteses/virgulas dentro de argumentos string (ex: `{{faker.helpers.fake("{{person.firstName}}")}}`) -> **Mitigacao**: Scope limitado ao documentado no Design. Argumentos complexos com chaves aninhadas estao fora do escopo. Documentar como limitacao -> **Task afetada**: T4
- **Risco**: undici muda API na v7 (breaking changes em relacao a v6) -> **Mitigacao**: HttpClient abstrai undici atras de interface. Se API mudar, so muda UndiciHttpClient -> **Task afetada**: T5
- **Risco**: FormData nativo do Node.js nao funciona corretamente com undici -> **Mitigacao**: Testar em T5/T6. Se necessario, usar `undici.FormData` em vez de `globalThis.FormData` -> **Task afetada**: T5, T6
- **Risco**: p-limit v6 em modo infinito pode acumular memoria se promises nao forem limpas -> **Mitigacao**: No Runner, usar Set de promises pendentes e remover ao completar. Nao acumular resultados -> **Task afetada**: T9
- **Risco**: SIGINT handling pode interferir em testes (handler global) -> **Mitigacao**: Registrar/remover handler no lifecycle do Runner. Em testes, expor metodo `abort()` em vez de emitir SIGINT -> **Task afetada**: T9
- **Risco**: Mockar @inquirer/prompts pode ser fragil se API mudar -> **Mitigacao**: Isolar wizard em funcao propria, mockar apenas os prompts, nao o wizard inteiro -> **Task afetada**: T10

## Definition of Done (para a feature inteira)

- [ ] Todos os testes passando (`pnpm test`)
- [ ] Coverage >= 80% em statements, branches, functions e lines (`pnpm test:coverage`)
- [ ] Todos os edge cases documentados neste spec estao cobertos por testes
- [ ] `pnpm build` compila sem erros
- [ ] `node dist/bin/repeater.js run tests/fixtures/valid-config.yaml` executa (request pode falhar se URL ficticia, mas imports e parsing funcionam)
- [ ] `node dist/bin/repeater.js init` inicia wizard interativo sem erros
- [ ] Teste manual com os 3 cenarios do Discover:
  - Cenario 1: Cadastro em massa (POST com body JSON e templates faker, 5 concorrentes, 50 total)
  - Cenario 2: Teste de carga (GET, 100 concorrentes, 1000 total)
  - Cenario 3: FormData (POST com bodyType formdata, 3 concorrentes, 10 total)
- [ ] Modo infinito funciona e para com Ctrl+C exibindo summary
- [ ] Codigo segue SRP, DRY, sem warnings do TypeScript (strict mode)
- [ ] Todos os imports usam extensao .js (ESM)
- [ ] Commits incrementais na main com mensagens descritivas (conventional commits)

## Ready? (gate)

- **Ready: yes**
- **Motivo**: 10 tasks decompostas com descricao completa, dependencias explicitas, criterios de aceite verificaveis, edge cases documentados, estrategia de testes TDD, e notas para o implementador com gotchas do Design. Nenhuma questao aberta bloqueante. A decomposicao segue a ordem bottom-up do Design e foi aprovada pelo usuario.
- **Proximos passos**: Rodar `/sdd-implement http-repeater` para iniciar a implementacao, comecando por T1 (setup do projeto)

## Handoff para Implementacao

> Resumo para o implementador. Leia esta secao primeiro.

### Ordem de implementacao

1. **T1** — Setup do projeto (pnpm, tsconfig, vitest, git, estrutura de pastas)
2. **T2** — Config types + Error classes (tipos compartilhados + classes de erro)
3. **T3** — Zod schema + Config parser (validacao YAML + fixtures)
4. **T4** — Template engine (regex + faker, validate + resolve)
5. **T5** — HttpClient (undici + timeout + error handling)
6. **T6** — BodyBuilder (JSON + FormData)
7. **T7** — RequestExecutor (HttpClient + timing -> RequestResult)
8. **T8** — Reporter (stdout formatting + summary)
9. **T9** — Runner (orquestrador: p-limit + loop + SIGINT)
10. **T10** — CLI (commander + run command + wizard + entry point)

### O que implementar primeiro (quick win)

**T1 + T2** sao as quick wins — setup puro e declaracoes de tipo. Em menos de 1 hora o projeto esta inicializado com tipos compilando e testes rodando. Isso desbloqueia todas as demais tasks.

### Cuidados criticos

1. **ESM imports com extensao .js**: Todo import relativo DEVE ter extensao `.js`. Ex: `import { RepeaterConfig } from './types.js'`. TypeScript compila .ts para .js, mas os imports precisam da extensao final desde o source. Se esquecer, o runtime lanca `ERR_MODULE_NOT_FOUND`

2. **zod + yaml**: O pacote `yaml` retorna objetos plain JS. zod parseia esses objetos normalmente. Atencao ao campo `total` que pode ser number ou string "infinite" — o `z.union([z.number().int().positive(), z.literal('infinite')])` resolve

3. **FormData + undici**: Usar `globalThis.FormData` (Node 18+). Ao passar FormData como body para undici, NAO setar Content-Type manualmente — o undici adiciona `multipart/form-data; boundary=...` automaticamente. Se setar manualmente, o boundary nao vai estar presente e a request vai falhar

4. **SIGINT no Runner**: Registrar handler com `process.on('SIGINT', ...)` e REMOVER com `process.removeListener` quando a execucao terminar. Se nao remover, handlers acumulam entre testes e causam comportamento erratico

5. **undici response body**: SEMPRE consumir o body da response (`await response.body.dump()`), mesmo que nao precise do conteudo. Se nao consumir, a conexao nao volta pro pool e o programa pode travar com muitas requests

6. **p-limit e modo infinito**: NAO acumular promises em array infinito. Usar um Set de promises pendentes e remover ao completar. Para summary, manter apenas contadores (totalRequests, successCount, sumDuration, minDuration, maxDuration)

7. **Template regex flag g**: A regex usa flag `g` (global). Ao usar com `String.prototype.replace`, todas as ocorrencias sao substituidas. Mas se usar com `RegExp.prototype.exec` em loop, lembrar de resetar `regex.lastIndex` entre chamadas (ou criar nova instancia a cada chamada)

8. **RunnerDeps inclui requestExecutor**: Diferente do Design original que tinha httpClient no RunnerDeps, a implementacao deve receber requestExecutor diretamente (ja wrappando o httpClient). Isso facilita mocking nos testes do Runner. A composicao httpClient -> requestExecutor e feita no run-command (T10)

### Como rodar os testes

```bash
# Rodar todos os testes
pnpm test

# Rodar testes em watch mode (rerun on change)
pnpm test:watch

# Rodar testes com coverage report
pnpm test:coverage

# Rodar testes de um modulo especifico
pnpm test -- tests/unit/template/engine.test.ts

# Type-check sem compilar
pnpm lint
```

### Como verificar que esta funcionando

```bash
# Compilar o projeto
pnpm build

# Testar o comando run com fixture
node dist/bin/repeater.js run tests/fixtures/valid-config.yaml
# (vai tentar requests para URL ficticia — esperar timeouts/erros de rede, mas sem erros de import/parsing)

# Testar o wizard
node dist/bin/repeater.js init
# (deve iniciar prompts interativos)

# Testar help
node dist/bin/repeater.js --help
node dist/bin/repeater.js run --help
node dist/bin/repeater.js init --help

# Testar com URL real (opcional, para validacao end-to-end)
# Criar um config apontando para https://httpbin.org/post e rodar:
node dist/bin/repeater.js run meu-config.yaml
```
