import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';

export const IMAGE_TYPES = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'],
  ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.avif', 'image/avif'],
  ['.svg', 'image/svg+xml'], ['.bmp', 'image/bmp'], ['.ico', 'image/x-icon'],
]);
export const VIDEO_TYPES = new Map([
  ['.mp4', 'video/mp4'], ['.m4v', 'video/mp4'], ['.webm', 'video/webm'],
  ['.ogv', 'video/ogg'], ['.ogg', 'video/ogg'], ['.mov', 'video/quicktime'],
  ['.mkv', 'video/x-matroska'],
]);

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function resolveResource(root, relativePath = '') {
  const candidate = path.resolve(root, relativePath.replaceAll('\\', '/'));
  if (!isInside(root, candidate) || relativePath.includes('\0')) {
    throw Object.assign(new Error('目录路径无效。'), { code: 'INVALID_PATH' });
  }
  // Real paths prevent a symbolic link from escaping the configured directory.
  const real = await fs.promises.realpath(candidate);
  if (!isInside(root, real)) {
    throw Object.assign(new Error('目录路径无效。'), { code: 'INVALID_PATH' });
  }
  return real;
}

const portablePath = (value) => value.split(path.sep).join('/');

export async function browseDirectory(root, relativePath = '') {
  const currentDirectory = await resolveResource(root, relativePath);
  if (!(await fs.promises.stat(currentDirectory)).isDirectory()) {
    throw Object.assign(new Error('目标不是目录。'), { code: 'NOT_DIRECTORY' });
  }
  const entries = await fs.promises.readdir(currentDirectory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
  const folders = [], images = [], videos = [];
  for (const entry of entries) {
    const entryPath = path.join(currentDirectory, entry.name);
    const relative = portablePath(path.relative(root, entryPath));
    if (entry.isDirectory()) {
      folders.push({ name: entry.name, path: relative });
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    if (!entry.isFile() || (!IMAGE_TYPES.has(extension) && !VIDEO_TYPES.has(extension))) continue;
    let stat;
    try { stat = await fs.promises.stat(entryPath); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const isImage = IMAGE_TYPES.has(extension);
    (isImage ? images : videos).push({
      name: entry.name, path: relative, size: stat.size, modified: stat.mtimeMs,
      url: `/${isImage ? 'image' : 'video'}/${relative.split('/').map(encodeURIComponent).join('/')}`,
    });
  }
  return { directory: root, currentPath: portablePath(path.relative(root, currentDirectory)), folders, images, videos };
}

export function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const first = Number(match[1]), last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
  const start = match[1] ? first : Math.max(0, size - last);
  const end = match[1] && match[2] ? Math.min(last, size - 1) : size - 1;
  return start >= 0 && start <= end && start < size ? { start, end } : null;
}

export async function serveMedia(request, response, root, urlPath, prefix, types) {
  let mediaPath;
  try { mediaPath = await resolveResource(root, decodeURIComponent(urlPath.slice(prefix.length))); }
  catch { response.writeHead(404).end('Not found'); return; }
  const mimeType = types.get(path.extname(mediaPath).toLowerCase());
  let file;
  try {
    if (!mimeType) { response.writeHead(404).end('Not found'); return; }
    file = await fs.promises.open(mediaPath, 'r');
    const stat = await file.stat();
    if (!stat.isFile()) { await file.close(); response.writeHead(404).end('Not found'); return; }
    const headers = {
      'Content-Type': mimeType, 'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes',
    };
    let range;
    if (request.headers.range) {
      range = parseRange(request.headers.range, stat.size);
      if (!range) {
        await file.close();
        response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
    }
    headers['Content-Length'] = range ? range.end - range.start + 1 : stat.size;
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === 'HEAD') { await file.close(); response.end(); }
    else pipeline(file.createReadStream(range || {}), response, () => {});
  } catch {
    if (file) await file.close().catch(() => {});
    if (response.headersSent) response.destroy();
    else response.writeHead(404).end('Not found');
  }
}
