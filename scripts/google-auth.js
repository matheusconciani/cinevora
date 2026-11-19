require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';
const redirectUrl = new URL(redirectUri);

if (!clientId || !clientSecret) {
  console.error('Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no arquivo .env.');
  process.exit(1);
}

const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const authorizeUrl = auth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive.readonly']
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  if (url.pathname !== redirectUrl.pathname) {
    res.writeHead(404).end('Nao encontrado');
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('Codigo OAuth ausente');
    return;
  }

  try {
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error('O Google nao retornou refresh token. Remova o acesso anterior da conta e tente novamente.');
    }

    const envPath = path.resolve(process.cwd(), '.env');
    let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (/^GOOGLE_REFRESH_TOKEN=.*$/m.test(env)) {
      env = env.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    } else {
      env += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
    }
    fs.writeFileSync(envPath, env);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Cinevora autorizado</h1><p>Voce pode fechar esta pagina e iniciar o addon.</p>');
    console.log('Refresh token salvo em .env');
    server.close();
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(error.message);
  }
});

server.listen(Number(redirectUrl.port || 3000), '127.0.0.1', () => {
  console.log('Abra esta URL no navegador:');
  console.log(authorizeUrl);
});
