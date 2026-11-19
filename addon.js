require('dotenv').config();

const express = require('express');
const { Readable } = require('stream');
const { google } = require('googleapis');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const fallbackMovies = require('./data/movies.json');

const PORT = Number(process.env.PORT || 7000);
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1ofcAA3qoNJ1C-0PUcpdvGk3HMrc4y1dp';

const VIDEO_MIME_PREFIX = 'video/';
const VIDEO_EXTENSIONS = /\.(mp4|mkv|avi|mov|m4v|webm|wmv|mpeg|mpg|ts)$/i;

function createAuth() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    return null;
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return auth;
}

function cleanMovieName(name) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[\._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferYear(name) {
  const match = name.match(/(?:^|[.\s_\-\[(])((?:19|20)\d{2})(?:$|[.\s_\-\])])/);
  return match ? Number(match[1]) : null;
}

function isVideoFile(file) {
  return (
    (file.mimeType && file.mimeType.startsWith(VIDEO_MIME_PREFIX)) ||
    (file.name && VIDEO_EXTENSIONS.test(file.name))
  );
}

async function listDriveVideos() {
  const auth = createAuth();
  if (!auth) return fallbackMovies;

  const drive = google.drive({ version: 'v3', auth });
  let pageToken;
  const videos = [];

  do {
    const response = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id,name,mimeType,size,modifiedTime,description,imageMediaMetadata)',
      pageSize: 1000,
      pageToken,
      orderBy: 'name_natural'
    });

    for (const file of response.data.files || []) {
      if (!isVideoFile(file)) continue;
      const year = inferYear(file.name);
      videos.push({
        id: file.id,
        name: cleanMovieName(file.name),
        description: file.description || `${cleanMovieName(file.name)} - arquivo salvo no Google Drive`,
        poster: '',
        year,
        size: file.size,
        mimeType: file.mimeType
      });
    }
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return videos;
}

function toMetaPreview(movie) {
  return {
    id: `cinevora:${movie.id}`,
    type: 'movie',
    name: movie.name,
    poster: movie.poster || undefined,
    description: movie.description,
    year: movie.year || undefined
  };
}

const builder = new addonBuilder({
  id: 'org.cinevora.drive',
  version: '1.0.0',
  name: 'Cinevora',
  description: 'Filmes proprios autorizados no Google Drive.',
  logo: '',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie'],
  catalogs: [
    {
      type: 'movie',
      id: 'cinevora-drive',
      name: 'Cinevora',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    }
  ],
  idPrefixes: ['cinevora:'],
  behaviorHints: {
    adult: false,
    p2p: false,
    configurable: false
  }
});

builder.defineCatalogHandler(async (args) => {
  let movies = await listDriveVideos();

  if (args.extra && args.extra.search) {
    const search = args.extra.search.toLowerCase();
    movies = movies.filter((movie) =>
      movie.name.toLowerCase().includes(search) ||
      (movie.description && movie.description.toLowerCase().includes(search))
    );
  }

  const skip = Number((args.extra && args.extra.skip) || 0);
  const page = movies.slice(skip, skip + 100);
  return { metas: page.map(toMetaPreview) };
});

builder.defineMetaHandler(async (args) => {
  const movies = await listDriveVideos();
  const id = args.id.replace(/^cinevora:/, '');
  const movie = movies.find((item) => item.id === id);

  if (!movie) return { meta: null };

  return {
    meta: {
      ...toMetaPreview(movie),
      background: undefined,
      videos: [
        {
          id: `cinevora:${movie.id}`,
          title: movie.name,
          released: movie.year ? `${movie.year}-01-01` : undefined
        }
      ]
    }
  };
});

builder.defineStreamHandler(async (args) => {
  if (args.type !== 'movie' || !args.id.startsWith('cinevora:')) {
    return { streams: [] };
  }

  const id = args.id.replace(/^cinevora:/, '');
  const publicUrl = `${PUBLIC_URL}/drive/${encodeURIComponent(id)}`;

  return {
    streams: [
      {
        name: 'Cinevora',
        title: 'Google Drive Publico',
        url: publicUrl
      }
    ]
  };
});

async function start() {
  const app = express();
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    next();
  });

  app.options('*', (req, res) => res.sendStatus(204));

  app.head('/drive/:fileId', async (req, res) => {
    const auth = createAuth();
    if (!auth) {
      try {
        const driveUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(req.params.fileId)}&export=download&confirm=t`;
        const response = await fetch(driveUrl, {
          method: 'HEAD',
          redirect: 'follow',
          headers: req.headers.range ? { Range: req.headers.range } : {}
        });
        res.status(response.status);
        for (const name of ['accept-ranges', 'content-type', 'content-length', 'content-range', 'etag', 'last-modified']) {
          if (response.headers.has(name)) res.setHeader(name, response.headers.get(name));
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end();
      } catch (error) {
        return res.status(502).send(error.message);
      }
    }

    try {
      const drive = google.drive({ version: 'v3', auth });
      const metadata = await drive.files.get({
        fileId: req.params.fileId,
        fields: 'id,name,mimeType,size'
      });
      res.setHeader('Accept-Ranges', 'bytes');
      if (metadata.data.mimeType) res.setHeader('Content-Type', metadata.data.mimeType);
      if (metadata.data.size) res.setHeader('Content-Length', metadata.data.size);
      return res.sendStatus(200);
    } catch (error) {
      return res.status(error.response?.status || 500).send(error.message);
    }
  });

  app.get('/drive/:fileId', async (req, res) => {
    const auth = createAuth();
    if (!auth) {
      try {
        const driveUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(req.params.fileId)}&export=download&confirm=t`;
        const response = await fetch(driveUrl, {
          redirect: 'follow',
          headers: req.headers.range ? { Range: req.headers.range } : {}
        });
        res.status(response.status);
        for (const name of ['accept-ranges', 'content-type', 'content-length', 'content-range', 'etag', 'last-modified']) {
          if (response.headers.has(name)) res.setHeader(name, response.headers.get(name));
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Accept-Ranges', 'bytes');
        if (!response.body) return res.end();
        return Readable.fromWeb(response.body).pipe(res);
      } catch (error) {
        return res.status(502).send(error.message);
      }
    }

    try {
      const drive = google.drive({ version: 'v3', auth });
      const metadata = await drive.files.get({
        fileId: req.params.fileId,
        fields: 'id,name,mimeType,size'
      });

      const headers = {};
      if (req.headers.range) headers.Range = req.headers.range;
      const media = await drive.files.get(
        { fileId: req.params.fileId, alt: 'media' },
        { responseType: 'stream', headers }
      );

      res.status(media.status || 200);
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
        if (media.headers[name]) res.setHeader(name === 'content-type' ? 'Content-Type' : name, media.headers[name]);
      }
      if (!media.headers['content-type'] && metadata.data.mimeType) {
        res.setHeader('Content-Type', metadata.data.mimeType);
      }
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(metadata.data.name || 'video')}";`);
      media.data.pipe(res);
    } catch (error) {
      const status = error.response?.status || 500;
      res.status(status).send(error.message);
    }
  });

  app.use(getRouter(builder.getInterface()));
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cinevora iniciado em ${PUBLIC_URL}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { cleanMovieName, inferYear, isVideoFile, listDriveVideos, builder };
