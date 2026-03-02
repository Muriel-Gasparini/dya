# DYA - Destroy Your App

![Statements](./badges/coverage-statements.svg)
![Branches](./badges/coverage-branches.svg)
![Functions](./badges/coverage-functions.svg)
![Lines](./badges/coverage-lines.svg)

CLI tool for mass HTTP request dispatching with configurable concurrency, dynamic data via faker, and YAML-based configuration.

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/Muriel-Gasparini/dya/main/install.sh | sh
```

This installs the `dya` binary to `~/.local/bin`. No Node.js required.

### From source

Requirements: Node.js >= 20, pnpm

```bash
pnpm install
pnpm build
pnpm link --global
```

## Usage

### Create config via interactive wizard

```bash
dya init
dya init -o my-config.yaml
```

### Run requests

```bash
dya run config.yaml
```

### Update to latest version

```bash
dya update
```

### Help

```bash
dya --help
```

## YAML Configuration

Full example with all fields:

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

### Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| method | string | (required) | HTTP method: GET, POST, PUT, PATCH, DELETE |
| url | string | (required) | Full endpoint URL |
| headers | map | {} | HTTP headers as key-value pairs |
| bodyType | string | none | Body type: json, formdata, urlencoded, none |
| body | map | {} | Body fields as key-value pairs |
| queryParams | map | {} | Query parameters as key-value pairs |
| concurrency | number | 1 | Number of concurrent requests |
| total | number or "infinite" | 1 | Total requests to send |
| timeoutMs | number | 5000 | Per-request timeout in milliseconds |
| successRange | object | {min: 200, max: 299} | Status code range considered success |

## Body Types

- **json** - Sends body as `application/json`
- **urlencoded** - Sends body as `application/x-www-form-urlencoded`
- **formdata** - Sends body as `multipart/form-data`
- **none** - No body (used for GET, DELETE)

## Faker Templates

Values in body, headers, and query params can use faker templates to generate dynamic data per request.

Syntax: `{{faker.module.method}}`

Examples:

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

Each request generates different values, allowing you to create realistic and varied data automatically.

## Success Range

By default, status codes between 200 and 299 are considered success. To customize, add the `successRange` field to your YAML:

```yaml
successRange:
  min: 200
  max: 399
```

In this example, any response with status between 200 and 399 (inclusive) is counted as success. `min` must be less than or equal to `max`, and both must be between 100 and 599.

## Examples

### Create users via POST with faker data

```yaml
method: POST
url: https://api.example.com/users
headers:
  Content-Type: application/json
  Authorization: Bearer my-token
bodyType: json
body:
  name: "{{faker.person.fullName}}"
  email: "{{faker.internet.email}}"
concurrency: 10
total: 100
timeoutMs: 5000
```

### High-concurrency GET health check

```yaml
method: GET
url: https://api.example.com/health
concurrency: 50
total: 1000
timeoutMs: 3000
```

### Urlencoded form submission

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

## Development

```bash
pnpm test            # Run tests
pnpm build           # Build
pnpm test:coverage   # Tests with coverage
pnpm lint            # Type check
```

## License

Apache-2.0
