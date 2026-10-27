import http from 'node:http';
import fs from 'node:fs/promises';
import { browseDirectory, serveMedia, IMAGE_TYPES, VIDEO_TYPES } from './media.js';

export async function createGalleryServer({ directory }) {
  const root = await fs.realpath(directory);
  if (!(await fs.stat(root)).isDirectory()) throw new Error(`不是目录：${directory}`);
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      for (const [prefix, types] of [['/image/', IMAGE_TYPES], ['/video/', VIDEO_TYPES]]) {
        if (url.pathname.startsWith(prefix)) {
          await serveMedia(request, response, root, url.pathname, prefix, types);
          return;
        }
      }
      if (url.pathname === '/api/browse') {
        const result = await browseDirectory(root, url.searchParams.get('path') || '');
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(request.method === 'HEAD' ? undefined : JSON.stringify(result));
        return;
      }
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    } catch (error) {
      const missing = ['INVALID_PATH', 'NOT_DIRECTORY', 'ENOENT', 'ENOTDIR'].includes(error.code);
      response.writeHead(missing ? 404 : 500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ error: missing ? '目录不存在或无法访问。' : '读取媒体目录失败。' }));
    }
  });
}
