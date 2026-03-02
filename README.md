# DYA - Destroy Your App

![Statements](./badges/coverage-statements.svg)
![Branches](./badges/coverage-branches.svg)
![Functions](./badges/coverage-functions.svg)
![Lines](./badges/coverage-lines.svg)

CLI tool para disparar requests HTTP em massa com concorrencia configuravel, dados dinamicos via faker e configuracao via YAML.

## Instalacao

Requisitos:

- Node.js >= 20
- pnpm

```bash
pnpm install
pnpm build
pnpm link --global
```

## Uso

### Criar configuracao via wizard

```bash
dya init
dya init -o minha-config.yaml
```

### Executar requests

```bash
dya run config.yaml
```

### Ajuda

```bash
dya --help
```

## Configuracao YAML

Exemplo completo com todos os campos:

```yaml
method: POST
url: https://api.acme.com/v1/accounts
headers:
  Content-Type: application/json
  Authorization: Bearer tk_live_abc123
bodyType: json
body:
  name: "{{faker.person.fullName}}"
  email: "{{faker.internet.email}}"
  phone: "{{faker.phone.number}}"
queryParams:
  source: cli
  campaign: load-test
concurrency: 5
total: 50
timeoutMs: 5000
successRange:
  min: 200
  max: 299
```

### Campos

| Campo | Tipo | Default | Descricao |
|-------|------|---------|-----------|
| method | string | (obrigatorio) | Metodo HTTP: GET, POST, PUT, PATCH, DELETE |
| url | string | (obrigatorio) | URL completa do endpoint |
| headers | map | {} | Headers HTTP como chave-valor |
| bodyType | string | none | Tipo do body: json, formdata, urlencoded, none |
| body | map | {} | Campos do body como chave-valor |
| queryParams | map | {} | Query parameters como chave-valor |
| concurrency | number | 1 | Numero de requests simultaneas |
| total | number ou "infinite" | 1 | Total de requests a disparar |
| timeoutMs | number | 5000 | Timeout por request em milissegundos |
| successRange | object | {min: 200, max: 299} | Range de status codes considerados sucesso |

## Body Types

- **json** - Envia o body como `application/json`
- **urlencoded** - Envia o body como `application/x-www-form-urlencoded`
- **formdata** - Envia o body como `multipart/form-data`
- **none** - Sem body (usado para GET, DELETE)

## Templates Faker

Valores no body, headers e query params podem usar templates faker para gerar dados dinamicos.

Sintaxe: `{{faker.module.method}}`

Exemplos:

```yaml
body:
  name: "{{faker.person.fullName}}"
  email: "{{faker.internet.email}}"
  phone: "{{faker.phone.number}}"
  company: "{{faker.company.name}}"
  address: "{{faker.location.streetAddress}}"
  id: "{{faker.string.uuid}}"
  code: "{{faker.string.numeric(6)}}"
```

Cada request gera valores diferentes, permitindo criar dados realistas e variados automaticamente.

## Success Range

Por default, status codes entre 200 e 299 sao considerados sucesso. Para customizar, adicione o campo `successRange` no YAML:

```yaml
successRange:
  min: 200
  max: 399
```

Neste exemplo, qualquer resposta com status entre 200 e 399 (inclusive) sera contada como sucesso. O campo `min` deve ser menor ou igual a `max`, e ambos devem estar entre 100 e 599.

## Exemplos

### Criar usuarios via POST com dados faker

```yaml
method: POST
url: https://api.example.com/users
headers:
  Content-Type: application/json
  Authorization: Bearer meu-token
bodyType: json
body:
  name: "{{faker.person.fullName}}"
  email: "{{faker.internet.email}}"
concurrency: 10
total: 100
timeoutMs: 5000
```

### Health check GET com alta concorrencia

```yaml
method: GET
url: https://api.example.com/health
concurrency: 50
total: 1000
timeoutMs: 3000
```

### Envio de formulario urlencoded

```yaml
method: POST
url: https://api.example.com/form
bodyType: urlencoded
body:
  action: register
  whatsapp: "{{faker.phone.number}}"
concurrency: 3
total: 10
```

## Desenvolvimento

```bash
# Rodar testes
pnpm test

# Build
pnpm build

# Testes com cobertura
pnpm test:coverage
```
