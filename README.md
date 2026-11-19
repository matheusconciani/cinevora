# Cinevora

Addon do Stremio para assistir aos filmes autorizados que voce mantem no Google Drive.

## Requisitos

- Node.js 18 ou mais novo
- Para links publicos: o arquivo precisa estar compartilhado com acesso "qualquer pessoa com o link"
- Para catalogo automatico da pasta: conta Google, projeto no Google Cloud e credenciais OAuth

## Instalacao

```powershell
npm install
Copy-Item .env.example .env
```

## Sem OAuth: link publico

O primeiro filme ja esta cadastrado em `data/movies.json` pelo ID extraido do link compartilhado. Para adicionar outros filmes publicos, inclua entradas no mesmo arquivo:

```json
{
  "id": "ID_DO_ARQUIVO_NO_DRIVE",
  "name": "Titulo exibido",
  "description": "Descricao opcional",
  "poster": "",
  "year": 2024
}
```

Nao use este modo com arquivos privados. Eles exigem o fluxo OAuth descrito abaixo.

Edite o `.env` e preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.

Autorize o addon:

```powershell
npm run auth
```

Abra a URL exibida no terminal, conclua o login no Google e aguarde a mensagem de sucesso.

Inicie:

```powershell
npm start
```

Instale no Stremio:

```text
http://127.0.0.1:7000/manifest.json
```

## Formato esperado

O addon lista apenas arquivos diretamente dentro da pasta configurada em `GOOGLE_DRIVE_FOLDER_ID`. Os seguintes formatos sao reconhecidos:

```text
mp4, mkv, avi, mov, m4v, webm, wmv, mpg, mpeg, ts
```

O nome do arquivo vira o titulo exibido no Stremio. Um ano entre 1900 e 2099 no nome tambem vira ano, por exemplo: `Meu.Filme.2024.mp4`.

## Publicacao

Para acessar fora da rede local, implante o addon em um host HTTPS e configure:

```env
PUBLIC_URL=https://seu-dominio.example
GOOGLE_REDIRECT_URI=https://seu-dominio.example/oauth2callback
```

O OAuth local e usado apenas para gerar o refresh token. Em producao, o addon nao precisa receber o callback OAuth novamente.

## Seguranca

- Nunca publique `.env`, o refresh token ou os arquivos de credenciais.
- O addon usa acesso somente leitura ao Drive.
- Compartilhe apenas a pasta que voce deseja liberar.
- O controle de acesso aos links locais/deploy depende da protecao do seu dominio.
