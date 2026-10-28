import http from 'node:http';
import fs from 'node:fs/promises';
import { browseDirectory, serveMedia, IMAGE_TYPES, VIDEO_TYPES } from './media.js';
import { ThumbnailStore } from './thumbnails.js';

export async function createGalleryServer({ directory }) {
  const root = await fs.realpath(directory);
  if (!(await fs.stat(root)).isDirectory()) throw new Error(`不是目录：${directory}`);
  const thumbnails = new ThumbnailStore(root);
  const listings = new Map();
  async function list(relative, refresh) {
    const previous = listings.get(relative);
    if (!refresh && previous && previous.expires > Date.now()) return previous.data;
    const data = await browseDirectory(root, relative);
    listings.delete(relative);
    if (data.images.length + data.videos.length + data.folders.length <= 10000) {
      listings.set(relative, { data, expires: Date.now() + 1500 });
      while (listings.size > 8) listings.delete(listings.keys().next().value);
    }
    return data;
  }
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/cache' && request.method === 'POST') {
        if (request.headers['x-gallery-manage'] !== '1') {
          response.writeHead(403).end(); return;
        }
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 8192) { response.writeHead(413).end(); return; }
        }
        let input;
        try { input = JSON.parse(body); } catch { response.writeHead(400).end(); return; }
        const result = await thumbnails.manage(input);
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(result));
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      if (url.pathname === '/api/cache') {
        const result = await thumbnails.status();
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(request.method === 'HEAD' ? undefined : JSON.stringify(result));
        return;
      }
      if (url.pathname.startsWith('/thumbnail/')) {
        let relative;
        try { relative = decodeURIComponent(url.pathname.slice('/thumbnail/'.length)); }
        catch { response.writeHead(404).end(); return; }
        const result = await thumbnails.request(relative);
        if (result.pending) {
          response.writeHead(202, { 'Retry-After': '1', 'Cache-Control': 'no-store' }).end(); return;
        }
        const headers = { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: result.etag, 'X-Content-Type-Options': 'nosniff' };
        if (request.headers['if-none-match'] === result.etag) response.writeHead(304, headers).end();
        else response.writeHead(200, { ...headers, 'Content-Length': result.buffer.length }).end(request.method === 'HEAD' ? undefined : result.buffer);
        return;
      }
      for (const [prefix, types] of [['/image/', IMAGE_TYPES], ['/video/', VIDEO_TYPES]]) {
        if (url.pathname.startsWith(prefix)) {
          await serveMedia(request, response, root, url.pathname, prefix, types);
          return;
        }
      }
      if (url.pathname === '/api/browse') {
        const result = await list(url.searchParams.get('path') || '', url.searchParams.get('refresh') === '1');
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(request.method === 'HEAD' ? undefined : JSON.stringify(result));
        return;
      }
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    } catch (error) {
      const missing = ['INVALID_PATH', 'NOT_DIRECTORY', 'ENOENT', 'ENOTDIR'].includes(error.code);
      if (response.headersSent || response.destroyed) return;
      response.writeHead(missing ? 404 : error.status || 500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ error: missing ? '目录不存在或无法访问。' : error.status ? error.message : '读取媒体目录失败。' }));
    }
  });
}
