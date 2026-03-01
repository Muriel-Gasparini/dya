# Brief — HTTP Repeater

> **Entrada (raw):**
> É esse aqui vai ser o repeater, vai ser um programa onde você define uma requisição a ser feita, tá. Hoje a gente vai poder eh suportar formdata e JSON, tá. Então, a gente vai poder especificar o método da requisição, se vai ser GET, vai ser POST, a URL, os carryparams, tudo, tá. Isso vai ser um arquivo de configuração. Eu quero que tudo seja CLI, beleza. E quando, mesmo se for formdata, a gente vai passar num formato JSON, tá, então a gente passa num formato JSON e aí depois a gente passa formdata. Creio que assim seja mais fácil. Se tiver outra ideia, me fale. Então em teoria que a gente vai criar um YAML, tá, e ele vai ser um sistema onde a gente define quais quantas requisições concorrentes vão ser feitas e quantas requisições no total serão feitas. A gente pode escolher infinite, ou seja, vai ser um loop pra sempre, ou um um valor qualquer, né, 10, 15, 20, enfim. E vai escolher quantas requisições concorrentes vão poder ser feitas. Ah, a gente quer um CLI onde a gente possa criar esse arquivo de configuração, né, sem precisar escrever na mão, o sistema escreve, a gente seleciona opções e depois a gente coloca pra rodar e ele roda. Então é um sistema que é pra ser rápido e fácil pra gente fazer requisições rápidas quando a gente quiser, na hora que a gente quiser, tá. E eu penso que a gente use Axios aqui, mas você pode dar outra ideia, caso você queira, porque a performance aqui deve ser alta. E cada requisição deve ter a sua, seu status de resposta e tal, né, se deu certo ou se não deu, enfim. eh Dê ideias aí do que que você acha que faça sentido. O nome do projeto tá sendo repeater, que é pra repetir nas requests, literalmente isso, e pode funcionar pra qualquer tipo de domínio e pra JSON formidata, por enquanto só requisições HTTP. eh autenticação, por enquanto vamos ignorar, tá? Vamos ignorar a autenticação, fazer requisições sem autenticação. E É isso. Ah, e outra coisa é que, por exemplo, às vezes eu quero que um campo mude toda a requisição, né, por exemplo, eu vou fazer várias requisições aqui pra registrar um número. Eu quero que cada requisição mude o número, né, porque se eu fizer do mesmo, vai falar que já existe. Então eu quero registrar várias contas aqui que eu tenho, né, pra fazer o processo mais rápido. Então a gente tem que tem que poder também especificar qual tipo de campo muda o dado e qual a forma do dado que a gente quer, enfim, deve deve ser um pouco inteligente essa parte aí.

## Problema / Objetivo (1–3 frases)

- CLI tool para disparar requisições HTTP em massa com concorrência configurável, suportando JSON e FormData, com campos dinâmicos que mudam a cada requisição.

## Contexto

- Sistema / área impactada: Ferramenta CLI standalone
- Como funciona hoje: Não existe — processo manual
- Por que isso importa agora: Automatizar envio de requisições repetitivas (ex: cadastro em massa)
- Stakeholders: Desenvolvedor (uso pessoal)

## Escopo inicial (hipótese)

- Inclui: CLI interativo para criar config YAML, execução de requests concorrentes, suporte JSON/FormData, campos dinâmicos por request, report de status por request
- Não inclui (non-goals): Autenticação, suporte a protocolos além de HTTP

## Restrições conhecidas

- Tempo/prazo: —
- Performance: Alta — foco em concorrência e velocidade
- Segurança/Compliance: —
- Compatibilidade: —
- Stack/infra: Node.js CLI

## Sinais de sucesso

- Conseguir disparar N requests concorrentes com campos variáveis e ver resultado de cada uma

## Perguntas em aberto

- Qual HTTP client usar (Axios vs undici vs fetch nativo)?
- Formato exato dos campos dinâmicos (template syntax? geradores?)
- Output: apenas terminal ou também arquivo de log?
