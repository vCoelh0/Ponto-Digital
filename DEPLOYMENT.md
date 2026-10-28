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

## Aplicativo instalável (PWA)

O build do frontend gera o manifesto, os ícones e `sw.js`. Esses arquivos são
servidos pelo Express junto com a interface; basta publicar uma nova versão no
mesmo serviço Render. Não há alteração de schema ou migração de dados.

- Android: abra no Chrome e use a sugestão de instalação ou o menu do navegador.
- iPhone: no menu de compartilhamento, escolha **Adicionar à Tela de Início**.
- A sugestão pode ser fechada e fica oculta por sete dias neste navegador.
- HTML, JavaScript, CSS, ícones e fontes podem ser armazenados em cache. Fontes
  externas são guardadas após o primeiro carregamento bem-sucedido.
- Respostas da API e do Clerk não entram no cache do service worker. Consultas,
  login e alterações de períodos continuam exigindo internet. Não há fila de
  registros offline para envio posterior.
- Uma abertura sem conexão mostra uma tela de indisponibilidade. Se a conexão
  cair durante o uso, a tela é ocultada até o retorno da rede, mantendo os campos
  já preenchidos em memória. A sessão no servidor não é encerrada.
- Novas versões exibem **Atualizar**. A página só recarrega após o aceite; a nova
  versão também pode assumir normalmente quando todas as abas antigas fecharem.

Para validar o manifesto, os ícones e as regras do service worker, execute
`pnpm --filter @workspace/ponto-digital test:pwa`. Os testes usam arquivos locais
e armazenamento em memória, sem acessar o banco.

Após o deploy, valide em um Android e um iPhone: instalar, abrir pelo ícone,
entrar na conta, iniciar/pausar/finalizar um período e reabrir sem conexão.
Também confira o aviso de atualização com uma aba antiga aberta. A instalação
e os controles oferecidos variam conforme o navegador.
