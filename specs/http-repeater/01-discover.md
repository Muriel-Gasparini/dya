# Discover — HTTP Repeater

## Contexto de domínio

- Domínio / área de negócio: Ferramenta de automação de requisições HTTP — uso pessoal de desenvolvedor
- Como funciona hoje: Não existe. O processo é manual — abrir Postman/curl e repetir requests uma por uma
- Dor / trigger que motivou este pedido: Precisar cadastrar múltiplas contas, testar endpoints em massa, ou repetir requests com dados variados. Hoje é lento e tedioso
- Por que é prioridade agora: Necessidade recorrente de automatizar envio de requests em lote
- Stakeholders envolvidos: Desenvolvedor (uso pessoal)
- Sistemas/serviços relacionados: Qualquer API HTTP (REST, formulários web, etc.)

## Decisões de produto e raciocínio

### Decisão 1 — HTTP Client: undici
- **Escolha**: undici (via import direto, não via fetch)
- **Alternativas descartadas**: Axios (performance inferior em alto volume), fetch nativo (overhead da API Fetch sobre undici)
- **Motivo**: Performance é prioridade #1. undici é o HTTP client mais rápido no ecossistema Node.js, com pool de conexões built-in e zero-copy parsing

### Decisão 2 — Campos dinâmicos: faker-js
- **Escolha**: @faker-js/faker como única engine de dados dinâmicos
- **Alternativas descartadas**: Geradores customizados (seq(), random.int(), uuid()) — adicionam complexidade sem necessidade, faker já cobre tudo
- **Motivo**: faker oferece centenas de geradores realistas (phone, email, name, address, etc.) com sintaxe uniforme. Simplifica a implementação e a experiência do usuário

### Decisão 3 — Output: terminal em tempo real
- **Escolha**: Exibir resultado de cada request no terminal conforme termina (stdout)
- **Alternativas descartadas**: Salvar em JSON/CSV — adiciona complexidade ao MVP sem necessidade imediata
- **Motivo**: O objetivo é feedback imediato. Salvamento em arquivo pode ser adicionado depois

### Decisão 4 — CLI wizard com preview
- **Escolha**: Wizard passo-a-passo interativo que ao final exibe o YAML gerado para confirmação
- **Alternativas descartadas**: Gerar YAML e abrir no editor (menos guiado), prompt único (pouco intuitivo)
- **Motivo**: Facilidade de uso — o usuário não precisa conhecer a estrutura do YAML para criar configs

### Decisão 5 — Linguagem: TypeScript
- **Escolha**: TypeScript com compilação
- **Alternativas descartadas**: JavaScript puro (sem tipagem estática)
- **Motivo**: Tipagem estática melhora manutenção, refatoração e catch de bugs em tempo de desenvolvimento

### Decisão 6 — Metodologia: TDD
- **Escolha**: Test-Driven Development — testes primeiro, código depois
- **Alternativas descartadas**: Testes depois da implementação
- **Motivo**: Decisão do usuário. Garante código modular, testável e com alta cobertura desde o início

### Decisão 7 — Falhas: ignorar e seguir
- **Escolha**: Request falhou → loga o erro no terminal → continua as próximas
- **Alternativas descartadas**: Retry com backoff (complexidade extra), abort total (muito agressivo)
- **Motivo**: Em cenários de massa, é mais útil ver quais falharam ao final do que parar tudo por uma falha

### Decisão 8 — Parada no modo infinito: Ctrl+C
- **Escolha**: Ctrl+C manual mata o processo e exibe summary
- **Alternativas descartadas**: Graceful shutdown (esperar requests em andamento), max-errors automático
- **Motivo**: Simplicidade para o MVP. O usuário controla quando parar

## Vision

- Uma CLI rápida e simples para disparar requests HTTP em massa, com configuração via YAML e dados dinâmicos via faker. "Configure uma vez, dispare quantas vezes quiser."

## Goals

- Disparar N requests HTTP concorrentes com configuração via YAML
- Suportar JSON e FormData como body
- Gerar dados dinâmicos por request usando faker (ex: cada request com um telefone diferente)
- Feedback em tempo real no terminal (status code, tempo de resposta)
- CLI wizard para criar configs sem escrever YAML na mão
- Alta performance com undici e concorrência configurável
- Código modular, DRY, clean code, com TDD e 80%+ coverage

## Non-goals (e por quê)

- Autenticação (tokens, cookies, OAuth) — complexidade alta, fora do MVP, pode ser adicionada depois
- Protocolos além de HTTP (WebSocket, gRPC) — escopo limitado a HTTP para o MVP
- Salvamento de resultados em arquivo (JSON/CSV) — output terminal é suficiente para v1
- Retry automático em falhas — simplicidade para o MVP
- Graceful shutdown — Ctrl+C direto é suficiente para v1
- Dashboard/UI web — é uma CLI tool, não precisa de interface gráfica

## Users / Personas

- Persona 1: Desenvolvedor (uso pessoal), quer automatizar cadastro em massa e testes de endpoints, frustrado com repetir requests manualmente no Postman/curl, uso frequente (várias vezes por semana)

## Problem statement

- Quando preciso cadastrar múltiplas contas, testar um endpoint com dados variados, ou simplesmente repetir uma request N vezes, não existe uma ferramenta simples de CLI que me permita configurar a request uma vez (método, URL, headers, body com dados dinâmicos) e disparar em massa com concorrência controlada.

## Cenários concretos

### Cenário 1 — Cadastro em massa de contas
- Contexto: O usuário precisa cadastrar 50 contas em uma API. Cada conta precisa de um número de telefone único.
- Ação do usuário: Roda `repeater init`, define POST para `https://api.example.com/register`, body JSON com `{ "phone": "{{faker.phone.number}}", "name": "{{faker.person.firstName}}" }`, 5 requests concorrentes, 50 no total. Confirma o YAML gerado. Roda `repeater run config.yaml`.
- Resultado esperado: 50 requests são disparadas (5 por vez), cada uma com telefone e nome diferentes. Terminal mostra `[1/50] POST 201 320ms`, `[2/50] POST 201 280ms`, etc.
- O que pode dar errado: API retorna 429 (rate limit), timeout de 5s é atingido, dados duplicados do faker (improvável mas possível)

### Cenário 2 — Teste de carga simples em endpoint
- Contexto: O usuário quer testar se um endpoint GET aguenta 100 requests concorrentes.
- Ação do usuário: Cria config YAML (via wizard ou manualmente) com GET `https://api.example.com/health`, 100 concorrentes, 1000 total. Roda `repeater run`.
- Resultado esperado: 1000 requests disparadas (100 por vez). Terminal mostra status codes e tempos. Ao final, summary com total de sucesso/falha e tempo médio.
- O que pode dar errado: Endpoint derruba, conexão recusada em volume alto, timeout em massa

### Cenário 3 — Envio de FormData com arquivo simulado
- Contexto: O usuário precisa testar um endpoint que aceita FormData (ex: upload de dados de formulário).
- Ação do usuário: Cria config com POST, body type FormData, campos `{ "email": "{{faker.internet.email}}", "company": "{{faker.company.name}}" }`. 3 concorrentes, 10 total.
- Resultado esperado: 10 requests com FormData, cada uma com email e empresa diferentes. Terminal mostra resultado de cada uma.
- O que pode dar errado: Content-Type não é setado corretamente para multipart/form-data

## MVP (must-have)

- Item 1: Config YAML com método, URL, headers, body (JSON/FormData), concorrência e total → Critério de aceite: Parser valida o YAML e rejeita configs inválidas com mensagem clara de erro
- Item 2: Engine de execução com concorrência controlada via undici → Critério de aceite: Respeita o limite de concorrência definido, nunca excede
- Item 3: Templates faker nos campos do body e query params → Critério de aceite: `{{faker.phone.number}}` gera valor diferente a cada request
- Item 4: Output em tempo real no terminal → Critério de aceite: Cada request exibe [index/total] METHOD status_code tempo_ms
- Item 5: CLI wizard para criar config YAML → Critério de aceite: Usuário consegue criar config completa sem editar YAML manualmente
- Item 6: Modo infinito (total: infinite) → Critério de aceite: Loop roda até Ctrl+C e exibe summary ao parar
- Item 7: Timeout de 5s por request (padrão) → Critério de aceite: Request que excede 5s é marcada como timeout
- Item 8: Headers customizáveis no YAML → Critério de aceite: Headers definidos no YAML são enviados em cada request
- Item 9: Query params dinâmicos com templates faker → Critério de aceite: Query params aceitam `{{faker...}}` e geram valores por request

## MMP (nice-to-have / next)

- Salvamento de resultados em JSON/CSV → Por que não é MVP: Output terminal é suficiente para v1
- Retry automático com backoff → Por que não é MVP: Complexidade extra, ignorar falhas é suficiente
- Autenticação (Bearer, Cookie, Basic) → Por que não é MVP: Escopo explicitamente excluído pelo usuário
- Graceful shutdown (esperar requests em andamento) → Por que não é MVP: Ctrl+C direto é aceitável para v1
- Progress bar visual (ora, cli-progress) → Por que não é MVP: Output de cada request já dá visibilidade
- Importar configs de Postman/curl → Por que não é MVP: Fora do escopo inicial

## User Stories

### US1 — Criar config via wizard

**Como** desenvolvedor
**Quero** criar uma config YAML respondendo perguntas interativas no terminal
**Para** não precisar escrever YAML manualmente e evitar erros de sintaxe

**Critérios de aceite**
- [ ] Wizard pergunta: método HTTP, URL, body type (JSON/FormData/nenhum), campos do body, headers, query params, concorrência, total de requests
- [ ] Campos do body e query params aceitam sintaxe faker (wizard mostra exemplos)
- [ ] Ao final, exibe preview do YAML gerado e pede confirmação
- [ ] Salva o arquivo YAML no path indicado pelo usuário (ou padrão `repeater.yaml`)

**Edge cases**
- Caso: URL inválida → Comportamento esperado: Rejeitar e pedir novamente
- Caso: Concorrência maior que total → Comportamento esperado: Ajustar concorrência = total
- Caso: Body vazio em POST → Comportamento esperado: Permitir (POST sem body é válido)
- Caso: Total = 0 → Comportamento esperado: Rejeitar, mínimo é 1 ou "infinite"

**Exemplos**
- Input: método=POST, url=https://api.com/register, body=json, campos={phone: "{{faker.phone.number}}"}, concurrency=5, total=50 → Output: arquivo `repeater.yaml` válido
- Input inválido: url="not-a-url" → Erro esperado: "URL inválida. Informe uma URL válida (ex: https://api.com/endpoint)"

### US2 — Executar requests a partir de config YAML

**Como** desenvolvedor
**Quero** rodar `repeater run <config.yaml>` e ver as requests sendo disparadas
**Para** automatizar o envio de requests em massa sem esforço manual

**Critérios de aceite**
- [ ] Lê e valida o YAML de configuração
- [ ] Dispara requests respeitando o limite de concorrência
- [ ] Cada request usa dados dinâmicos gerados pelo faker
- [ ] Exibe resultado de cada request em tempo real: `[index/total] METHOD URL status_code tempo_ms`
- [ ] Ao finalizar, exibe summary: total enviadas, sucesso, falhas, tempo médio, tempo total
- [ ] Requests com falha (timeout, erro de rede, status 4xx/5xx) são logadas e a execução continua
- [ ] Modo infinito: roda até Ctrl+C, exibe summary ao parar

**Edge cases**
- Caso: Arquivo YAML não encontrado → Comportamento esperado: Erro claro "Arquivo não encontrado: <path>"
- Caso: YAML com sintaxe inválida → Comportamento esperado: Erro de parsing com linha do erro
- Caso: URL retorna timeout em todas as requests → Comportamento esperado: Loga cada timeout, continua, summary mostra 100% falha
- Caso: Concorrência = 1 → Comportamento esperado: Requests sequenciais (uma por vez)
- Caso: Template faker inválido (ex: `{{faker.naoExiste}}`) → Comportamento esperado: Erro claro antes de iniciar execução
- Caso: Ctrl+C durante execução → Comportamento esperado: Mata o processo e exibe summary parcial

**Exemplos**
- Input: config válida, 10 requests, 2 concorrentes → Output: 10 linhas de resultado + summary
- Input: config com total: infinite → Output: requests contínuas até Ctrl+C

### US3 — Suporte a FormData

**Como** desenvolvedor
**Quero** enviar requests com body FormData (definido em JSON no YAML)
**Para** testar endpoints que aceitam multipart/form-data

**Critérios de aceite**
- [ ] No YAML, body type "formdata" converte campos JSON para FormData na request
- [ ] Content-Type é setado automaticamente para multipart/form-data
- [ ] Campos do FormData aceitam templates faker
- [ ] Se body type é "json", Content-Type é application/json

**Edge cases**
- Caso: Body type formdata mas campos vazios → Comportamento esperado: Envia FormData vazio (válido)
- Caso: Body type não reconhecido → Comportamento esperado: Erro claro "Body type inválido. Use: json, formdata"

**Exemplos**
- Input: body_type=formdata, campos={email: "{{faker.internet.email}}"} → Output: request com Content-Type: multipart/form-data e campo email com valor gerado

### US4 — Templates faker em fields dinâmicos

**Como** desenvolvedor
**Quero** usar `{{faker.phone.number}}` nos campos do body/query params e cada request gerar um valor diferente
**Para** cadastrar dados únicos em massa (ex: 50 contas com telefones diferentes)

**Critérios de aceite**
- [ ] Sintaxe `{{faker.<module>.<method>}}` é reconhecida em body fields e query params
- [ ] Cada request resolve os templates com valores novos
- [ ] Templates inválidos são detectados e reportados antes de iniciar a execução (validação prévia)
- [ ] Valores fixos (sem template) são enviados como estão

**Edge cases**
- Caso: Campo com mix de texto fixo e template: `"BR{{faker.string.numeric(11)}}"` → Comportamento esperado: Gera "BR" + 11 dígitos aleatórios
- Caso: Template com argumento: `{{faker.string.numeric(5)}}` → Comportamento esperado: Gera string numérica de 5 caracteres
- Caso: Múltiplos templates no mesmo campo: `"{{faker.person.firstName}} {{faker.person.lastName}}"` → Comportamento esperado: Resolve ambos

**Exemplos**
- Input: `{ "phone": "{{faker.phone.number}}" }` em 3 requests → Output: `{"phone": "+1-555-123-4567"}`, `{"phone": "+1-555-987-6543"}`, `{"phone": "+1-555-456-7890"}`

## Success metrics

- Métrica: Tempo para configurar e disparar 100 requests (baseline: manual ~30min → target: <2min) (medir com cronômetro)
- Métrica: Cobertura de testes (baseline: 0 → target: >=80%) (medir com coverage tool)

## Constraints

- Técnica: Node.js + TypeScript, undici como HTTP client, @faker-js/faker para dados dinâmicos
- Negócio: Uso pessoal, não precisa de multi-tenancy ou auth
- Compliance: Nenhuma restrição
- Tempo: Sem prazo definido
- Qualidade: TDD obrigatório, código modular (DRY, single responsibility), coverage >= 80%

## Risks

- Risco: faker gera dados duplicados em volume muito alto → Mitigação: Documentar como limitação (probabilidade baixa) → Probabilidade: baixa
- Risco: undici API muda em versões futuras → Mitigação: Abstrair undici atrás de uma interface → Probabilidade: baixa
- Risco: Template parsing complexo (args, nested) pode ter bugs → Mitigação: TDD com muitos edge cases no parser → Probabilidade: média

## Open questions

- Nenhuma questão aberta bloqueante. Todas as decisões principais foram tomadas com o usuário.

## Assumptions

- A1: faker-js cobre todos os tipos de dados necessários para os cenários do usuário → Consequência se errada: Precisaria adicionar geradores customizados → Validada com usuário: sim
- A2: 5s de timeout é suficiente para a maioria dos cenários → Consequência se errada: Tornar timeout configurável no YAML (MMP) → Validada com usuário: sim
- A3: Ctrl+C sem graceful shutdown é aceitável → Consequência se errada: Requests em andamento podem ficar "perdidas" → Validada com usuário: sim

## Glossário

- **Repeater**: Nome do projeto. CLI tool para repetir requests HTTP em massa.
- **Config YAML**: Arquivo de configuração que define a request (método, URL, body, headers) e execução (concorrência, total).
- **Template faker**: Sintaxe `{{faker.<module>.<method>}}` nos campos do YAML que é substituída por dados gerados pelo faker a cada request.
- **Concorrência**: Número máximo de requests em voo ao mesmo tempo.
- **Total**: Número total de requests a disparar. Pode ser um número ou "infinite" (loop até Ctrl+C).
- **Body type**: Formato do body da request — "json" (application/json) ou "formdata" (multipart/form-data).

## Handoff para Design

> Resumo para o próximo agente (Architect). Leia esta seção primeiro.

### O que foi decidido
- CLI tool em TypeScript com undici para HTTP e @faker-js/faker para dados dinâmicos
- Config via YAML com wizard interativo (passo-a-passo + preview)
- Suporte a JSON e FormData como body, headers customizáveis, query params dinâmicos
- Concorrência configurável, total finito ou infinito, timeout de 5s
- Falhas são ignoradas (log + continua), Ctrl+C para parar modo infinito
- Output em tempo real no terminal com summary ao final
- TDD obrigatório, código modular (DRY, SRP), coverage >= 80%
- Git na main, commits incrementais, sem assinatura de IA

### O que ficou em aberto
- Nada bloqueante. Decisões de implementação (estrutura de pastas, abstrações) ficam para o Design.

### Riscos que o Design deve considerar
- Abstração do undici (para facilitar troca futura e testes)
- Parser de templates faker deve ser robusto (args, múltiplos templates, texto misto)
- FormData handling pode ter nuances (Content-Type boundary, encoding)

### Recomendações para o Architect
- Modularizar: config parser, template engine, request executor, reporter, CLI wizard — cada um com responsabilidade única
- Abstrair undici atrás de interface para facilitar mocking em testes
- Template engine deve validar templates antes de executar (fail-fast)
- Considerar p-limit ou similar para controle de concorrência
- Pensar na testabilidade desde o design (dependency injection, interfaces claras)
