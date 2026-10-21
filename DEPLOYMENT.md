# Deploy gratuito

O projeto é publicado como um único serviço web no Render. O Express serve a
API em `/api` e também os arquivos compilados do frontend. O banco PostgreSQL
fica no Neon e a autenticação continua no Clerk.

## Variáveis obrigatórias

- `DATABASE_URL`: string de conexão agrupada (pooled) do Neon.
- `CLERK_PUBLISHABLE_KEY`: chave pública do Clerk.
- `CLERK_SECRET_KEY`: chave secreta do Clerk.
- `VITE_CLERK_PUBLISHABLE_KEY`: a mesma chave pública usada acima. O prefixo
  `VITE_` permite que ela seja incluída no frontend durante o build.

Nunca salve os valores reais dessas variáveis no Git.

## Preparar o banco

No primeiro deploy, o Render executa automaticamente
`pnpm --filter @workspace/db push` por meio do `initialDeployHook`. Nos próximos
deploys que alterarem o schema, execute esse comando manualmente com
`DATABASE_URL` definida apenas no terminal local antes de publicar a nova
versão.

## Publicar no Render

O arquivo `render.yaml` descreve o serviço gratuito. Depois de enviar este
arquivo ao GitHub, crie um Blueprint no Render usando o repositório e preencha
as quatro variáveis solicitadas. O health check usado pelo Render é
`/api/healthz`.

Cada push na branch conectada inicia um novo deploy. O serviço gratuito hiberna
depois de um período sem tráfego e pode demorar para responder ao primeiro
acesso seguinte.
