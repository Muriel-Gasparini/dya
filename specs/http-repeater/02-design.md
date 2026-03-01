# Design — HTTP Repeater

## Resumo executivo

Repeater e uma CLI tool em TypeScript que dispara requests HTTP em massa a partir de configuracao YAML. A arquitetura segue cinco modulos com responsabilidade unica: ConfigParser (leitura e validacao do YAML), TemplateEngine (resolucao de expressoes `{{faker.*}}`), RequestExecutor (disparo HTTP via undici com concorrencia controlada por p-limit), Reporter (output em tempo real e summary final) e CLI (comandos `init` e `run` via commander + wizard interativo via @inquirer/prompts). Cada modulo expoe uma interface TypeScript que permite injecao de dependencia e mocking em testes. O projeto usa pnpm, vitest com coverage >= 80%, e ESM nativo.

## Contexto herdado do Discover

- **Requisitos-chave**: Disparar N requests HTTP concorrentes com config YAML; suportar JSON e FormData como body; gerar dados dinamicos por request via faker-js; feedback em tempo real no terminal; CLI wizard interativo para criar configs; modo infinito (loop ate Ctrl+C); timeout de 5s por request
- **Constraints**: Node.js + TypeScript, undici como HTTP client, @faker-js/faker para dados dinamicos, TDD obrigatorio, coverage >= 80%, codigo modular (DRY, SRP), uso pessoal (sem auth, sem multi-tenancy)
- **Cenarios de referencia**: (1) Cadastro em massa de 50 contas com telefone unico por request, 5 concorrentes; (2) Teste de carga com 1000 requests, 100 concorrentes; (3) FormData com email e empresa dinamicos, 3 concorrentes, 10 total
- **Decisoes de produto que afetam o design**: undici direto (nao via fetch) para performance maxima; faker-js como unica engine de dados dinamicos (sem geradores customizados); falhas sao logadas e ignoradas (sem retry); Ctrl+C mata o processo sem graceful shutdown; output apenas terminal (sem arquivo); wizard passo-a-passo com preview do YAML antes de salvar
- **Edge cases ja identificados**: URL invalida no wizard (rejeitar e pedir novamente); concorrencia > total (ajustar concorrencia = total); body vazio em POST (permitir); total = 0 (rejeitar); arquivo YAML nao encontrado; YAML com sintaxe invalida; template faker invalido (fail-fast antes de executar); timeout em todas as requests (logar cada uma, summary mostra 100% falha); mix de texto fixo + template no mesmo campo; multiplos templates no mesmo campo; template com argumentos `{{faker.string.numeric(5)}}`

## Decisoes tecnicas e raciocinio

### Decisao 1 — HTTP Client: undici (import direto)

- **Escolha**: undici v7.x via `import { request } from 'undici'`
- **Alternativas consideradas**:
  - Axios: API amigavel, interceptors built-in. Contras: overhead de abstracoes, performance inferior em alto volume, depende de http/https nativo
  - fetch nativo (globalThis.fetch): Zero dependencia a partir de Node 18. Contras: internamente usa undici mas com overhead da spec Fetch (Headers object, Response stream), menos controle sobre pool de conexoes
- **Motivo da escolha**: Performance e prioridade #1 do projeto. undici e o HTTP client mais rapido no ecossistema Node.js. Import direto da `request()` elimina overhead da API Fetch. Pool de conexoes built-in permite reutilizacao eficiente em cenarios de alto volume
- **Riscos aceitos**: API do undici pode mudar entre majors. Mitigacao: abstrair atras de interface `HttpClient`

### Decisao 2 — Package Manager: pnpm

- **Escolha**: pnpm v9.x
- **Alternativas consideradas**:
  - npm: Padrao do Node.js, sem setup extra. Contras: mais lento, node_modules flat com hoisting pode causar phantom dependencies
  - yarn: Cache offline, workspaces nativos. Contras: sem vantagem significativa para projeto single-package, pnpm e mais rapido
- **Motivo da escolha**: Escolha do usuario. pnpm e mais rapido, economiza disco via content-addressable storage, lockfile deterministico, e previne phantom dependencies com node_modules nao-flat
- **Riscos aceitos**: Nenhum significativo. pnpm e maduro e amplamente adotado

### Decisao 3 — CLI Framework: commander

- **Escolha**: commander v13.x
- **Alternativas consideradas**:
  - yargs: Parsing robusto, middleware support. Contras: API mais verbosa, bundle maior, features desnecessarias para 2 comandos simples
  - citty (unjs): Moderno, zero-dep. Contras: ecossistema menor, menos documentacao, risco de breaking changes
- **Motivo da escolha**: Escolha do usuario. commander e o padrao de mercado para CLIs Node.js, API declarativa, leve (~50KB), excelente documentacao. Para 2 comandos (`init` e `run`), e a escolha ideal
- **Riscos aceitos**: Nenhum. commander e estavel ha anos

### Decisao 4 — CLI Wizard: @inquirer/prompts

- **Escolha**: @inquirer/prompts v7.x (versao modular do Inquirer)
- **Alternativas consideradas**:
  - prompts: Leve, API simples. Contras: menos tipos de prompt, manutenibilidade questionavel (poucos updates recentes)
  - clack: Output elegante, DX bonita. Contras: ecossistema menor, menos maduro, API menos flexivel para validacao
- **Motivo da escolha**: Escolha do usuario. @inquirer/prompts e a referencia para prompts interativos em Node.js, modular (importa so o que usa), validacao built-in, suporte a todos os tipos de prompt necessarios (select, input, confirm, number)
- **Riscos aceitos**: Nenhum. Inquirer e o padrao de mercado

### Decisao 5 — Test Framework: vitest

- **Escolha**: vitest v3.x com @vitest/coverage-v8
- **Alternativas consideradas**:
  - jest: Maduro, ecossistema enorme. Contras: ESM support requer configuracao extra (--experimental-vm-modules), transformacao de modulos e lenta, config verbose para TypeScript
  - node:test: Zero dependencia. Contras: menos features (sem coverage built-in, sem mocking avancado, sem watch mode robusto), assertions basicas
- **Motivo da escolha**: Escolha do usuario. vitest e nativo ESM, rapido (Vite-powered), API compativel com Jest (facilita migracao se necessario), coverage built-in via c8/v8, watch mode performante, excelente DX com TypeScript sem configuracao adicional
- **Riscos aceitos**: Nenhum. vitest e maduro e estavel

### Decisao 6 — Concurrency Control: p-limit

- **Escolha**: p-limit v6.x
- **Alternativas consideradas**:
  - Semaphore manual (Promise + queue): Controle total, zero dependencia. Contras: mais codigo para manter, mais bugs potenciais, reinventar a roda para algo trivial
  - p-queue: Mais features (prioridade, pause/resume). Contras: overkill para o caso de uso, API mais complexa que p-limit
- **Motivo da escolha**: p-limit faz exatamente uma coisa (limitar concorrencia de promises) e faz bem. API minimalista: `const limit = pLimit(5); limit(() => fetch(...))`. Zero overhead. Amplamente usado e testado. Alternativa manual seria codigo extra sem valor agregado
- **Riscos aceitos**: Nenhum. p-limit e uma dependencia minima (~200 bytes)

### Decisao 7 — YAML Parser: yaml (v2)

- **Escolha**: yaml v2.x (pacote `yaml` no npm)
- **Alternativas consideradas**:
  - js-yaml: Maduro, amplamente usado. Contras: nao suporta YAML 1.2 completo, API de customizacao mais limitada, tipagem TypeScript menos completa
  - yaml (v2): YAML 1.2 completo, API moderna, tipagem TypeScript excelente, suporte a preservar comentarios
- **Motivo da escolha**: `yaml` v2 e mais moderno, tem tipagem TypeScript completa out-of-the-box, suporta YAML 1.2, e a API de parsing com schema validation e mais limpa. Para um projeto TypeScript-first, e a escolha natural
- **Riscos aceitos**: Nenhum. Pacote maduro e bem mantido

### Decisao 8 — Template Engine: regex-based custom parser

- **Escolha**: Parser customizado baseado em regex para resolver expressoes `{{faker.*}}`
- **Alternativas consideradas**:
  - Handlebars/Mustache: Engine completa de templates. Contras: overkill massivo para o caso de uso (so precisa resolver `{{faker.*}}`), dependencia pesada, sintaxe conflita com o uso desejado
  - Template literals (eval): Flexivel. Contras: inseguro (eval/Function), abre brecha para code injection, nao necessario
- **Motivo da escolha**: O caso de uso e especifico: substituir `{{faker.module.method}}` e `{{faker.module.method(args)}}` por valores gerados. Um regex `/{{\s*faker\.([a-zA-Z0-9_.]+)(?:\(([^)]*)\))?\s*}}/g` resolve isso com clareza, testabilidade e zero dependencias extras. A engine e isolada em um modulo proprio, facil de testar e estender
- **Riscos aceitos**: Regex pode nao cobrir edge cases extremos (ex: parenteses dentro de argumentos). Mitigacao: TDD extensivo com todos os edge cases documentados no Discover

### Decisao 9 — Module System: ESM nativo

- **Escolha**: ECMAScript Modules (ESM) via `"type": "module"` no package.json
- **Alternativas consideradas**:
  - CommonJS (CJS): Compatibilidade maxima. Contras: sintaxe legada, nao suporta top-level await, importa ESM-only packages com dificuldade
  - Dual (CJS + ESM): Maximo de compatibilidade. Contras: complexidade de build desnecessaria para uma CLI tool (nao e lib)
- **Motivo da escolha**: ESM e o padrao moderno do JavaScript. undici, p-limit e @faker-js/faker sao ESM-first. vitest e ESM nativo. Nao ha razao para CJS em um projeto greenfield. `"type": "module"` no package.json e suficiente
- **Riscos aceitos**: Nenhum para projeto novo

### Decisao 10 — Build: tsc (TypeScript compiler)

- **Escolha**: tsc para compilacao, sem bundler
- **Alternativas consideradas**:
  - tsup/esbuild: Build rapido, bundling. Contras: complexidade extra de config, CLI tool nao precisa de bundle unico, tree-shaking nao e relevante
  - tsx (runtime): Roda TypeScript direto sem compilar. Contras: overhead de runtime, nao gera .js para distribuicao, nao validaria tipos em build time
- **Motivo da escolha**: Para uma CLI tool, tsc e suficiente. Compila TypeScript para JavaScript, valida tipos em build time, output direto em `dist/`. Sem necessidade de bundling ou minificacao
- **Riscos aceitos**: Build mais lento que esbuild para projetos grandes. Irrelevante para o tamanho deste projeto

## Architecture overview

### Componentes

```
+------------------+     +------------------+     +------------------+
|                  |     |                  |     |                  |
|   CLI (commander |---->|  ConfigParser    |---->|  TemplateEngine  |
|   + inquirer)    |     |  (yaml + zod)    |     |  (regex + faker) |
|                  |     |                  |     |                  |
+------------------+     +------------------+     +------------------+
        |                                                  |
        |                                                  |
        v                                                  v
+------------------+     +------------------+     +------------------+
|                  |     |                  |     |                  |
|   Runner         |---->|  RequestExecutor |     |  BodyBuilder     |
|   (orchestrator) |     |  (undici+p-limit)|     |  (json/formdata) |
|                  |     |                  |     |                  |
+------------------+     +------------------+     +------------------+
        |
        v
+------------------+
|                  |
|   Reporter       |
|   (stdout)       |
|                  |
+------------------+
```

### Responsabilidades de cada componente

1. **CLI** (`src/cli/`): Ponto de entrada. Registra comandos `init` e `run` via commander. O comando `init` invoca o Wizard. O comando `run` invoca o Runner.

2. **Wizard** (`src/cli/wizard.ts`): Coleta inputs do usuario via @inquirer/prompts (metodo, URL, body type, campos, headers, query params, concorrencia, total). Gera o YAML, exibe preview, pede confirmacao, salva arquivo.

3. **ConfigParser** (`src/config/`): Le o arquivo YAML, parseia com `yaml`, valida com zod schema. Retorna um objeto `RepeaterConfig` tipado ou lanca erro com mensagem clara.

4. **TemplateEngine** (`src/template/`): Recebe uma string com potenciais templates `{{faker.*}}`, identifica todas as expressoes via regex, resolve cada uma chamando o metodo correspondente do faker. Tem dois modos: `validate` (verifica se os templates sao validos sem gerar valores) e `resolve` (gera valores).

5. **BodyBuilder** (`src/request/body-builder.ts`): Recebe os campos do body ja com templates resolvidos e o body type. Se JSON, retorna `JSON.stringify(fields)` com Content-Type `application/json`. Se FormData, cria `FormData` com os campos e deixa Content-Type ser setado automaticamente (multipart/form-data com boundary).

6. **RequestExecutor** (`src/request/executor.ts`): Recebe URL, method, headers, body (pronto) e timeout. Faz a request via `undici.request()`. Retorna `RequestResult` com status, tempo, erro se houver. Nao conhece templates nem config -- so dispara HTTP.

7. **Runner** (`src/runner.ts`): Orquestrador principal. Recebe `RepeaterConfig`, cria um loop de N iteracoes (ou infinito), para cada iteracao: resolve templates (TemplateEngine), constroi body (BodyBuilder), enfileira na fila de concorrencia (p-limit), ao completar cada request emite resultado para o Reporter. Gerencia o signal SIGINT para modo infinito.

8. **Reporter** (`src/reporter.ts`): Recebe resultados de requests e imprime no stdout. Formata cada linha como `[index/total] METHOD status_code tempo_ms` (ou `[index] METHOD status_code tempo_ms` no modo infinito). Ao final, imprime summary (total, sucesso, falhas, tempo medio, tempo total).

### Fluxo principal (happy path)

```
Usuario roda: repeater run config.yaml

1. CLI parseia argumentos (commander)
2. CLI chama ConfigParser.parse("config.yaml")
   2.1. Le arquivo do disco (fs.readFile)
   2.2. Parseia YAML (yaml.parse)
   2.3. Valida contra schema zod
   2.4. Retorna RepeaterConfig tipado
3. CLI chama TemplateEngine.validateAll(config)
   3.1. Extrai todos os templates de body fields e query params
   3.2. Verifica se cada faker path e valido (ex: faker.phone.number existe?)
   3.3. Se invalido: lanca erro com detalhes (qual template, qual campo)
4. CLI cria Runner com config e dependencias injetadas
5. Runner.execute()
   5.1. Cria p-limit com concurrency da config
   5.2. Para i = 1 ate total (ou infinito):
     5.2.1. Enfileira na fila de concorrencia:
       a. TemplateEngine.resolve(bodyFields) → campos com valores gerados
       b. TemplateEngine.resolve(queryParams) → params com valores gerados
       c. BodyBuilder.build(resolvedFields, bodyType) → body pronto + content-type
       d. Monta URL final com query params resolvidos
       e. RequestExecutor.execute({ url, method, headers, body, timeout })
       f. Reporter.report(index, total, result)
   5.3. Ao finalizar todas (ou SIGINT): Reporter.summary(results)
```

### Fluxo de erro

```
Erros de configuracao (fail-fast, antes de qualquer request):
  - Arquivo nao encontrado → ConfigError: "Arquivo nao encontrado: config.yaml"
  - YAML invalido → ConfigError: "Erro de sintaxe no YAML na linha 15: ..."
  - Schema invalido → ConfigError: "Campo 'method' e obrigatorio" / "method deve ser GET, POST, PUT, PATCH ou DELETE"
  - Template invalido → TemplateError: "Template invalido no campo 'body.phone': faker.naoExiste nao e um metodo valido do faker"

Erros de execucao (por request, nao interrompem o loop):
  - Timeout → RequestResult { status: null, error: "Timeout de 5000ms excedido", durationMs: 5000 }
  - Erro de rede → RequestResult { status: null, error: "ECONNREFUSED 127.0.0.1:3000", durationMs: 120 }
  - HTTP 4xx/5xx → RequestResult { status: 429, error: null, durationMs: 200 } (reportado normalmente, nao e "erro" da tool)

Output de erro de request:
  [3/50] POST  ERR  Timeout de 5000ms excedido
  [7/50] POST  ERR  ECONNREFUSED 127.0.0.1:3000
  [12/50] POST  429  200ms
```

## Interfaces / Contracts

### TypeScript Interfaces principais

```typescript
// src/config/types.ts

/** Metodos HTTP suportados */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Tipos de body suportados */
type BodyType = 'json' | 'formdata' | 'none';

/** Total de requests: numero finito ou infinito */
type RequestTotal = number | 'infinite';

/** Configuracao completa parseada do YAML */
interface RepeaterConfig {
  /** Metodo HTTP */
  method: HttpMethod;
  /** URL do endpoint (pode conter {{faker.*}} em query params) */
  url: string;
  /** Headers HTTP (chave-valor, valores podem conter {{faker.*}}) */
  headers: Record<string, string>;
  /** Tipo do body */
  bodyType: BodyType;
  /** Campos do body (chave-valor, valores podem conter {{faker.*}}) */
  body: Record<string, string>;
  /** Query parameters (chave-valor, valores podem conter {{faker.*}}) */
  queryParams: Record<string, string>;
  /** Numero maximo de requests simultaneas */
  concurrency: number;
  /** Total de requests a disparar */
  total: RequestTotal;
  /** Timeout por request em milissegundos */
  timeoutMs: number;
}
```

```typescript
// src/request/types.ts

/** Resultado de uma request individual */
interface RequestResult {
  /** Indice da request (1-based) */
  index: number;
  /** Metodo HTTP usado */
  method: HttpMethod;
  /** URL final (com query params resolvidos) */
  url: string;
  /** Status code da resposta (null se erro de rede/timeout) */
  status: number | null;
  /** Duracao em milissegundos */
  durationMs: number;
  /** Mensagem de erro (null se sucesso) */
  error: string | null;
}

/** Summary da execucao completa */
interface ExecutionSummary {
  /** Total de requests disparadas */
  totalRequests: number;
  /** Requests com sucesso (status 2xx) */
  successCount: number;
  /** Requests com falha (status != 2xx ou erro) */
  failureCount: number;
  /** Tempo medio de resposta em ms */
  avgDurationMs: number;
  /** Tempo minimo de resposta em ms */
  minDurationMs: number;
  /** Tempo maximo de resposta em ms */
  maxDurationMs: number;
  /** Tempo total de execucao em ms */
  totalDurationMs: number;
}
```

```typescript
// src/template/template-engine.ts

interface TemplateEngine {
  /**
   * Valida se todos os templates em um record sao validos.
   * Lanca TemplateError se algum template e invalido.
   * Nao gera valores — apenas verifica que os faker paths existem.
   */
  validateRecord(fields: Record<string, string>): void;

  /**
   * Resolve todos os templates em uma string, substituindo
   * {{faker.*}} por valores gerados.
   * Retorna a string com valores concretos.
   */
  resolve(template: string): string;

  /**
   * Resolve todos os templates em um record de string.
   * Retorna novo record com valores concretos.
   */
  resolveRecord(fields: Record<string, string>): Record<string, string>;
}
```

```typescript
// src/request/http-client.ts

/** Opcoes para uma request HTTP */
interface HttpRequestOptions {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body: string | FormData | null;
  timeoutMs: number;
}

/** Resposta crua do HTTP client */
interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
}

/**
 * Abstrai o HTTP client (undici) para facilitar
 * mocking em testes e eventual troca de implementacao.
 */
interface HttpClient {
  execute(options: HttpRequestOptions): Promise<HttpResponse>;
}
```

```typescript
// src/request/body-builder.ts

interface BodyBuilder {
  /**
   * Constroi o body da request e retorna o body serializado
   * e o Content-Type correspondente.
   */
  build(
    fields: Record<string, string>,
    bodyType: BodyType
  ): { body: string | FormData | null; contentType: string | null };
}
```

```typescript
// src/reporter.ts

interface Reporter {
  /** Reporta o resultado de uma request individual */
  reportResult(result: RequestResult, total: RequestTotal): void;

  /** Reporta o summary final da execucao */
  reportSummary(summary: ExecutionSummary): void;
}
```

```typescript
// src/runner.ts

interface RunnerDeps {
  templateEngine: TemplateEngine;
  httpClient: HttpClient;
  bodyBuilder: BodyBuilder;
  reporter: Reporter;
}

interface Runner {
  execute(config: RepeaterConfig): Promise<ExecutionSummary>;
}
```

### Nao ha API HTTP nem eventos/filas

Este projeto e uma CLI tool standalone. Nao expoe API HTTP propria, nao consome filas, nao emite eventos. As interfaces acima sao contratos internos entre modulos TypeScript.

## Data model / Schema

### Schema do YAML de configuracao

Nao ha banco de dados. O "schema" deste projeto e o formato do arquivo YAML de configuracao.

#### Schema completo (com zod)

```typescript
// src/config/schema.ts
import { z } from 'zod';

const httpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const bodyTypeSchema = z.enum(['json', 'formdata', 'none']);

const totalSchema = z.union([
  z.number().int().positive(),
  z.literal('infinite'),
]);

export const repeaterConfigSchema = z
  .object({
    method: httpMethodSchema,
    url: z.string().url(),
    headers: z.record(z.string()).default({}),
    bodyType: bodyTypeSchema.default('none'),
    body: z.record(z.string()).default({}),
    queryParams: z.record(z.string()).default({}),
    concurrency: z.number().int().positive().default(1),
    total: totalSchema.default(1),
    timeoutMs: z.number().int().positive().default(5000),
  })
  .refine(
    (data) => {
      if (typeof data.total === 'number' && data.concurrency > data.total) {
        return false;
      }
      return true;
    },
    {
      message:
        'concurrency nao pode ser maior que total (sera ajustado automaticamente)',
      path: ['concurrency'],
    }
  );
```

#### Exemplo de YAML completo (todos os campos)

```yaml
# repeater.yaml — Cadastro em massa de contas
method: POST
url: https://api.example.com/register
headers:
  Content-Type: application/json
  X-Custom-Header: my-value
bodyType: json
body:
  phone: "{{faker.phone.number}}"
  name: "{{faker.person.firstName}}"
  email: "{{faker.internet.email}}"
queryParams:
  source: "repeater"
  ref: "{{faker.string.uuid}}"
concurrency: 5
total: 50
timeoutMs: 5000
```

#### Exemplo minimo (GET sem body)

```yaml
method: GET
url: https://api.example.com/health
concurrency: 10
total: 100
```

#### Exemplo com FormData

```yaml
method: POST
url: https://api.example.com/form
bodyType: formdata
body:
  email: "{{faker.internet.email}}"
  company: "{{faker.company.name}}"
concurrency: 3
total: 10
```

#### Exemplo com modo infinito

```yaml
method: GET
url: https://api.example.com/ping
concurrency: 2
total: infinite
```

#### Mapeamento YAML -> RepeaterConfig

| Campo YAML     | Tipo no TS          | Default   | Obrigatorio | Validacao                                    |
|----------------|---------------------|-----------|-------------|----------------------------------------------|
| `method`       | `HttpMethod`        | -         | Sim         | Um de: GET, POST, PUT, PATCH, DELETE         |
| `url`          | `string`            | -         | Sim         | URL valida (parseable por `new URL()`)       |
| `headers`      | `Record<string,string>` | `{}`  | Nao         | Chave-valor string                           |
| `bodyType`     | `BodyType`          | `"none"`  | Nao         | Um de: json, formdata, none                  |
| `body`         | `Record<string,string>` | `{}`  | Nao         | Chave-valor string (valores podem ter templates) |
| `queryParams`  | `Record<string,string>` | `{}`  | Nao         | Chave-valor string (valores podem ter templates) |
| `concurrency`  | `number`            | `1`       | Nao         | Inteiro positivo                             |
| `total`        | `number \| "infinite"` | `1`    | Nao         | Inteiro positivo ou "infinite"               |
| `timeoutMs`    | `number`            | `5000`    | Nao         | Inteiro positivo (milissegundos)             |

## Estrutura de pastas

```
repeater/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── bin/
│   └── repeater.ts          # Entry point CLI (#!/usr/bin/env node → dist)
├── src/
│   ├── cli/
│   │   ├── index.ts          # Setup commander, registra comandos
│   │   ├── run-command.ts    # Handler do comando "run"
│   │   └── wizard.ts         # Wizard interativo (inquirer)
│   ├── config/
│   │   ├── parser.ts         # Le YAML, parseia, valida
│   │   ├── schema.ts         # Zod schema do YAML
│   │   └── types.ts          # RepeaterConfig, HttpMethod, BodyType, etc.
│   ├── template/
│   │   ├── engine.ts         # TemplateEngine (regex + faker)
│   │   └── errors.ts         # TemplateError
│   ├── request/
│   │   ├── http-client.ts    # Interface HttpClient + implementacao undici
│   │   ├── body-builder.ts   # BodyBuilder (json/formdata)
│   │   ├── executor.ts       # RequestExecutor (combina http-client + timing)
│   │   └── types.ts          # RequestResult, HttpRequestOptions, etc.
│   ├── reporter.ts           # Reporter (stdout + summary)
│   ├── runner.ts             # Runner (orquestrador principal)
│   └── errors.ts             # ConfigError, erros base
├── tests/
│   ├── unit/
│   │   ├── config/
│   │   │   ├── parser.test.ts
│   │   │   └── schema.test.ts
│   │   ├── template/
│   │   │   └── engine.test.ts
│   │   ├── request/
│   │   │   ├── http-client.test.ts
│   │   │   ├── body-builder.test.ts
│   │   │   └── executor.test.ts
│   │   ├── reporter.test.ts
│   │   └── runner.test.ts
│   └── fixtures/
│       ├── valid-config.yaml
│       ├── minimal-config.yaml
│       ├── formdata-config.yaml
│       ├── infinite-config.yaml
│       └── invalid-config.yaml
└── specs/
    └── http-repeater/
        ├── 00-brief.md
        ├── 01-discover.md
        ├── 02-design.md
        └── 03-tasks.md
```

## Template Engine — Detalhes de implementacao

### Regex Pattern

```typescript
const TEMPLATE_REGEX = /\{\{\s*faker\.([a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)+)(?:\(([^)]*)\))?\s*\}\}/g;
```

**Grupos capturados:**
- Grupo 1: faker path (ex: `phone.number`, `string.numeric`, `person.firstName`)
- Grupo 2: argumentos opcionais (ex: `5`, `"##-####"`, vazio se sem args)

### Exemplos de resolucao

| Template input                                    | Regex match                          | Faker call                               | Output exemplo              |
|--------------------------------------------------|--------------------------------------|------------------------------------------|-----------------------------|
| `{{faker.phone.number}}`                         | path=`phone.number`, args=null       | `faker.phone.number()`                   | `"+1-555-123-4567"`         |
| `{{faker.string.numeric(5)}}`                    | path=`string.numeric`, args=`5`      | `faker.string.numeric(5)`               | `"83921"`                   |
| `BR{{faker.string.numeric(11)}}`                 | path=`string.numeric`, args=`11`     | Prefixo "BR" + `faker.string.numeric(11)` | `"BR19283746501"`           |
| `{{faker.person.firstName}} {{faker.person.lastName}}` | Dois matches                    | Resolve ambos independentemente           | `"Maria Silva"`             |
| `texto sem template`                             | Nenhum match                         | Retorna inalterado                        | `"texto sem template"`      |

### Algoritmo de resolucao

```typescript
function resolve(template: string): string {
  return template.replace(TEMPLATE_REGEX, (match, fakerPath, rawArgs) => {
    const parts = fakerPath.split('.');
    let current: any = faker;
    for (const part of parts) {
      current = current[part];
      if (current === undefined) {
        throw new TemplateError(`Template invalido: faker.${fakerPath} nao existe`);
      }
    }
    if (typeof current !== 'function') {
      throw new TemplateError(`faker.${fakerPath} nao e um metodo (e ${typeof current})`);
    }
    const args = rawArgs ? parseArgs(rawArgs) : [];
    return String(current(...args));
  });
}
```

### Parsing de argumentos

Argumentos dentro de `{{faker.method(args)}}` sao parseados de forma simples:

- Numerico: `5` -> `5` (number)
- String entre aspas: `"##-####"` -> `"##-####"` (string)
- Booleano: `true` / `false` -> boolean
- Multiplos args: `5, true` -> `[5, true]`

```typescript
function parseArgs(raw: string): unknown[] {
  if (!raw.trim()) return [];
  return raw.split(',').map((arg) => {
    const trimmed = arg.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    // Remove aspas se presentes
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  });
}
```

### Validacao (fail-fast)

Antes de iniciar a execucao, o Runner chama `templateEngine.validateRecord()` em todos os campos que podem conter templates (body e queryParams). Esta funcao:

1. Extrai todos os matches do regex
2. Para cada match, navega o faker object para verificar que o path existe
3. Verifica que o path aponta para uma funcao
4. Se qualquer template e invalido, lanca `TemplateError` com detalhes

Isso garante que erros de template sao detectados **antes** de disparar qualquer request.

## CLI Commands

### `repeater run <file>`

```
repeater run <file> [options]

Dispara requests HTTP conforme configuracao YAML.

Argumentos:
  file          Path para o arquivo YAML de configuracao (obrigatorio)

Opcoes:
  -h, --help    Exibe ajuda

Exemplos:
  repeater run config.yaml
  repeater run ./configs/register.yaml
```

**Comportamento:**
1. Valida que o arquivo existe
2. Parseia e valida o YAML (ConfigParser)
3. Valida todos os templates faker (TemplateEngine.validateAll)
4. Inicia execucao (Runner.execute)
5. Registra handler SIGINT para summary no Ctrl+C

**Exit codes:**
- 0: Execucao completada (inclui requests com falha -- sao esperadas)
- 1: Erro de configuracao (arquivo nao encontrado, YAML invalido, template invalido)

### `repeater init`

```
repeater init [options]

Wizard interativo para criar arquivo de configuracao YAML.

Opcoes:
  -o, --output <path>   Path do arquivo de saida (default: "repeater.yaml")
  -h, --help            Exibe ajuda

Exemplos:
  repeater init
  repeater init -o register.yaml
```

**Fluxo do wizard (passo a passo):**

1. **Metodo HTTP** (select): GET, POST, PUT, PATCH, DELETE
2. **URL** (input): Validacao de URL (tenta `new URL(input)`)
3. **Headers** (loop): Adicionar header? (confirm) -> key (input) + value (input) -> repetir
4. **Body type** (select): json, formdata, none (so se metodo != GET)
5. **Body fields** (loop, se body != none): Adicionar campo? (confirm) -> key (input) + value (input com exemplo faker) -> repetir
6. **Query params** (loop): Adicionar query param? (confirm) -> key (input) + value (input) -> repetir
7. **Concorrencia** (number input): Default 1, minimo 1
8. **Total** (input): Numero ou "infinite", default 1, minimo 1
9. **Timeout** (number input): Default 5000ms, minimo 100
10. **Preview**: Exibe o YAML gerado formatado no terminal
11. **Confirmacao** (confirm): Salvar? Sim -> salva. Nao -> "Configuracao descartada."

**Exemplo de sessao do wizard:**

```
$ repeater init

? Metodo HTTP: POST
? URL do endpoint: https://api.example.com/register
? Adicionar header? Yes
? Header key: Content-Type
? Header value: application/json
? Adicionar mais headers? No
? Tipo do body: json
? Adicionar campo ao body? Yes
? Campo key: phone
? Campo value (use {{faker.xxx}} para dados dinamicos): {{faker.phone.number}}
? Adicionar mais campos? Yes
? Campo key: name
? Campo value (use {{faker.xxx}} para dados dinamicos): {{faker.person.firstName}}
? Adicionar mais campos? No
? Adicionar query param? No
? Concorrencia (requests simultaneas): 5
? Total de requests (numero ou "infinite"): 50
? Timeout por request (ms): 5000

--- Preview ---
method: POST
url: https://api.example.com/register
headers:
  Content-Type: application/json
bodyType: json
body:
  phone: "{{faker.phone.number}}"
  name: "{{faker.person.firstName}}"
concurrency: 5
total: 50
timeoutMs: 5000
--- Fim ---

? Salvar configuracao em repeater.yaml? Yes
Configuracao salva em repeater.yaml
```

## Tech stack

| Dependencia             | Versao   | Tipo       | Justificativa                                                                 |
|-------------------------|----------|------------|-------------------------------------------------------------------------------|
| TypeScript              | ^5.7     | devDep     | Tipagem estatica, refatoracao segura, catch de bugs em compile time           |
| undici                  | ^7.0     | dep        | HTTP client mais rapido do Node.js, pool de conexoes built-in                |
| @faker-js/faker         | ^9.0     | dep        | Geracao de dados dinamicos realistas, centenas de modulos                     |
| commander               | ^13.0    | dep        | CLI framework leve, API declarativa, padrao de mercado                       |
| @inquirer/prompts       | ^7.0     | dep        | Prompts interativos modulares, validacao built-in                            |
| yaml                    | ^2.7     | dep        | YAML 1.2 parser/serializer, tipagem TS completa                             |
| zod                     | ^3.24    | dep        | Schema validation, tipagem inferida, mensagens de erro claras               |
| p-limit                 | ^6.2     | dep        | Controle de concorrencia de promises, API minimalista                       |
| vitest                  | ^3.0     | devDep     | Test framework rapido, ESM nativo, coverage built-in, API Jest-like         |
| @vitest/coverage-v8     | ^3.0     | devDep     | Provider de coverage para vitest via V8                                     |

### Node.js version

- **Minimo**: Node.js 20 LTS (ESM estavel, fetch built-in se necessario como fallback)
- **Recomendado**: Node.js 22 LTS

### package.json parcial (campos relevantes)

```json
{
  "name": "repeater",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "repeater": "./dist/bin/repeater.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### tsconfig.json parcial (campos relevantes)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*", "bin/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/types.ts', 'src/**/errors.ts'],
    },
  },
});
```

## Non-functional requirements

### Performance

- **Throughput**: O bottleneck e a rede, nao a tool. O overhead da tool (template resolution, body building, reporting) deve ser < 1ms por request
- **Concorrencia**: p-limit garante que no maximo N requests estao em voo simultaneamente. Nao ha pool proprio -- undici gerencia pool de conexoes internamente
- **Memoria**: Para 10.000 requests com concorrencia 100, o uso de memoria deve ficar abaixo de 200MB. Resultados sao reportados em streaming (nao acumulados em array). Para o summary, apenas contadores sao mantidos em memoria (nao os resultados individuais)
- **Startup time**: CLI deve iniciar em < 500ms (cold start incluindo import de faker)

### Testabilidade

- **Dependency injection**: Todos os modulos recebem dependencias via construtor/parametro (nao importam diretamente). Runner recebe `RunnerDeps` com templateEngine, httpClient, bodyBuilder, reporter
- **Interfaces**: HttpClient e abstrato, permitindo mock completo do undici em testes. Reporter e abstrato, permitindo capturar output em testes sem stdout
- **Fixtures YAML**: Arquivos YAML de teste em `tests/fixtures/` para cenarios validos e invalidos
- **Coverage target**: >= 80% em statements, branches, functions e lines. Threshold configurado no vitest.config.ts para falhar o build se nao atingido

### Observabilidade

- **Output por request**: `[index/total] METHOD URL statusCode durationMs` ou `[index/total] METHOD URL ERR errorMessage` — impresso em stdout conforme cada request completa
- **Summary final**: Impresso em stdout ao finalizar (ou no SIGINT). Contem: total, sucesso, falha, avg/min/max duration, tempo total
- **Sem metricas/traces**: Projeto CLI de uso pessoal, nao requer Prometheus, OpenTelemetry ou similar
- **Stderr para erros de config**: Erros fatais (config invalida, template invalido) vao para stderr. Resultados de requests vao para stdout

### Confiabilidade

- **Sem retry**: Decisao de produto. Requests falhas sao logadas e ignoradas
- **Sem circuit breaker**: Nao aplicavel — a tool dispara requests contra APIs externas, nao gerencia um servico proprio
- **Timeout**: 5000ms default por request (configuravel no YAML). Implementado via `signal: AbortSignal.timeout(timeoutMs)` no undici
- **SIGINT handling**: `process.on('SIGINT', ...)` registra handler que seta flag `aborted = true`. O loop verifica a flag antes de enfileirar novas requests. Requests em voo completam normalmente (ou dando timeout). Summary e exibido com dados parciais

## Rollout / Migration / Rollback

### Estrategia de rollout

Projeto greenfield, sem usuarios existentes. O rollout e a primeira release funcional.

1. Implementar modulos bottom-up (ver ordem em Handoff)
2. Testes unitarios para cada modulo com coverage >= 80%
3. Teste manual end-to-end com os 3 cenarios do Discover
4. Publicar como ferramenta local (nao publicar no npm inicialmente -- `pnpm link --global` para uso pessoal)

### Feature flags

Nao aplicavel. Projeto CLI de uso pessoal.

### Plano de migracao de dados

Nao aplicavel. Nao ha dados persistidos.

### Plano de rollback

Nao aplicavel para v1. Em versoes futuras, manter backward compatibility do schema YAML (novas keys sao opcionais, keys existentes nao mudam de semantica).

### Versionamento do YAML

O schema YAML nao tem campo de versao no v1. Se o schema mudar de forma incompativel no futuro, adicionar campo `version: 2` e manter parser para v1 por pelo menos 1 major release.

## Open questions

Nenhuma questao aberta bloqueante. Todas as decisoes tecnicas foram tomadas.

## Assumptions

- A1: zod v3.24 suporta `z.union` com literal "infinite" sem problemas. Consequencia se errada: usar `.transform()` para converter string "infinite" antes da validacao
- A2: undici `request()` aceita `signal: AbortSignal.timeout(ms)` para timeout. Consequencia se errada: usar `setTimeout` + `AbortController` manualmente
- A3: `FormData` do Node.js nativo (globalThis.FormData, disponivel desde Node 18) funciona com undici. Consequencia se errada: usar `undici.FormData` ou pacote `formdata-node`

## Ready? (gate)

- **Ready: yes**
- **Motivo**: Todas as decisoes tecnicas foram tomadas com o usuario. Arquitetura definida com 8 modulos de responsabilidade unica. Interfaces TypeScript completas. Schema YAML com validacao zod. Template engine com regex documentada e edge cases cobertos. Fluxo principal e de erro detalhados. Tech stack com versoes e justificativas. NFRs com numeros concretos. Nenhuma questao aberta bloqueante.
- **Proximo passo**: Rodar `/sdd-task http-repeater` para decompor a arquitetura em tasks implementaveis

## Handoff para Tasks

> Resumo para o Dev Lead. Leia esta secao primeiro.

### Componentes a implementar

1. **Config types** (`src/config/types.ts`): Tipos TypeScript compartilhados (HttpMethod, BodyType, RepeaterConfig, RequestTotal)
2. **Config schema** (`src/config/schema.ts`): Zod schema com validacoes e defaults
3. **Config parser** (`src/config/parser.ts`): Le YAML, parseia com `yaml`, valida com zod schema, retorna RepeaterConfig
4. **Error classes** (`src/errors.ts`, `src/template/errors.ts`): ConfigError, TemplateError com mensagens claras
5. **Template engine** (`src/template/engine.ts`): Regex parser, validacao fail-fast, resolucao de templates faker com suporte a argumentos
6. **HttpClient** (`src/request/http-client.ts`): Interface + implementacao undici (request + timeout via AbortSignal)
7. **BodyBuilder** (`src/request/body-builder.ts`): Converte campos para JSON string ou FormData, retorna body + content-type
8. **RequestExecutor** (`src/request/executor.ts`): Combina HttpClient + timing, retorna RequestResult
9. **Reporter** (`src/reporter.ts`): Formata e imprime resultados por request e summary final
10. **Runner** (`src/runner.ts`): Orquestrador — loop com p-limit, resolve templates, constroi body, dispara request, reporta resultado, gerencia SIGINT
11. **CLI setup** (`src/cli/index.ts`): commander com comandos `init` e `run`
12. **Run command** (`src/cli/run-command.ts`): Handler do `repeater run <file>`
13. **Wizard** (`src/cli/wizard.ts`): Prompts interativos, gera YAML, preview, confirmacao, salva arquivo
14. **Entry point** (`bin/repeater.ts`): Shebang, importa CLI setup

### Contratos definidos

- `RepeaterConfig`: Interface principal que todo modulo consome
- `TemplateEngine`: Interface com `validate`, `resolve`, `resolveRecord`
- `HttpClient`: Interface que abstrai undici (`execute(options) -> HttpResponse`)
- `BodyBuilder`: Interface que converte campos em body HTTP (`build(fields, type) -> { body, contentType }`)
- `Reporter`: Interface para output (`reportResult`, `reportSummary`)
- `Runner`: Interface do orquestrador (`execute(config) -> ExecutionSummary`)
- Zod schema: Validacao completa do YAML com defaults e refinements

### Ordem sugerida de implementacao

Implementar bottom-up, das dependencias mais internas para as mais externas:

1. **Fase 1 — Fundacao** (sem dependencias entre si):
   - Config types + error classes
   - Config schema (zod)
   - Config parser (yaml + zod)

2. **Fase 2 — Core engines** (dependem de types):
   - Template engine (regex + faker)
   - HttpClient (undici)
   - BodyBuilder (json/formdata)

3. **Fase 3 — Orquestracao** (depende de tudo acima):
   - RequestExecutor (HttpClient + timing)
   - Reporter (stdout formatting)
   - Runner (p-limit + template + body + executor + reporter)

4. **Fase 4 — CLI** (depende do Runner):
   - CLI setup (commander)
   - Run command
   - Wizard (inquirer)
   - Entry point (bin)

### Gotchas e cuidados

1. **Template regex e args parsing**: O regex `/{{\s*faker\.([a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)+)(?:\(([^)]*)\))?\s*}}/g` deve ser testado exaustivamente. Cuidado com: espacos dentro das chaves, argumentos com aspas, multiplos templates na mesma string, templates adjacentes sem separador
2. **FormData no Node.js**: Usar `globalThis.FormData` (disponivel desde Node 18). Se undici nao aceitar nativamente, usar `undici.FormData`. Testar que o Content-Type inclui boundary automaticamente
3. **p-limit e modo infinito**: No modo infinito, o loop nunca termina. Garantir que SIGINT seta flag `aborted` e o loop para de enfileirar novas requests. Nao acumular resultados em array (apenas contadores para summary)
4. **undici timeout**: Usar `signal: AbortSignal.timeout(timeoutMs)` que e nativo do Node.js 20+. O erro retornado e `AbortError` — tratar especificamente para diferenciar de outros erros
5. **zod + YAML**: O pacote `yaml` retorna objetos plain. zod precisa parsear esses objetos. Atencao ao tipo de `total` que pode ser number ou string "infinite" no YAML — zod `z.union` resolve
6. **ESM imports**: Todos os imports devem incluir extensao `.js` (TypeScript compila .ts para .js, imports precisam da extensao final). Ex: `import { parse } from './parser.js'`
7. **Shebang no entry point**: `bin/repeater.ts` deve ter `#!/usr/bin/env node` e ser compilado para `dist/bin/repeater.js`. Adicionar `"bin": {"repeater": "./dist/bin/repeater.js"}` no package.json
8. **Concorrencia > total**: O zod refine captura isso, mas o Runner tambem deve tratar: se concurrency > total, ajustar concurrency = total silenciosamente (ja validado no schema, mas defesa em profundidade)

### O que ficou em aberto

Nada bloqueante para a implementacao. Todas as decisoes tecnicas foram documentadas com alternativas e raciocinio.
