import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { resolveResource, IMAGE_TYPES } from './media.js';

export const CACHE_FOLDER = '.gallery-thumbnails';
const OWNER = 'lan-gallery-thumbnails-v1';
const RECIPE = 'webp-768-q78-v1';
const imageFile = /^[a-f0-9]{64}\.webp$/;
const temporaryFile = /^[a-f0-9-]+\.tmp$/;
const version = stat => `${stat.size}-${stat.mtimeMs}`;
const portable = value => value.split(path.sep).join('/');
const fault = (message, status = 503) => Object.assign(new Error(message), { status });
sharp.cache(false);
sharp.concurrency(1);

// Only native asynchronous sharp jobs run here. No synchronous encoding on the HTTP loop.
export class ThumbnailStore {
  constructor(root) {
    this.root = root;
    this.directories = new Set();
    this.jobs = new Map();
    this.tail = Promise.resolve();
    this.epoch = 0;
    this.paused = false;
    this.maxBytes = 2 * 1024 ** 3;
    this.active = 0;
    this.loaded = false;
    this.touched = new Map();
  }

  exclusive(operation) {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => {});
    return result;
  }

  initialize() {
    return this.initialization ||= this.exclusive(() => this.load());
  }

  async cacheDirectory(relative = '', create = false) {
    const parent = await resolveResource(this.root, relative);
    if (!(await fs.stat(parent)).isDirectory()) throw fault('缓存父目录不存在。', 404);
    const directory = path.join(parent, CACHE_FOLDER);
    let stat;
    try { stat = await fs.lstat(directory); }
    catch (error) {
      if (error.code !== 'ENOENT' || !create) throw error;
      await fs.mkdir(directory);
      stat = await fs.lstat(directory);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw fault('缩略图目录不能是链接或文件。');
    const marker = path.join(directory, 'owner.json');
    try {
      const markerStat = await fs.lstat(marker);
      if (!markerStat.isFile() || markerStat.isSymbolicLink()) throw fault('缓存标识无效。');
      if (JSON.parse(await fs.readFile(marker, 'utf8')).owner !== OWNER) throw fault('目录不属于本画廊缓存。');
    } catch (error) {
      if (error.code !== 'ENOENT' || !create) throw error;
      if ((await fs.readdir(directory)).length) throw fault('同名目录已存在且不是受管缓存。');
      await fs.writeFile(marker, JSON.stringify({ owner: OWNER }), { flag: 'wx' });
    }
    return directory;
  }

  async readJSON(directory, name, fallback) {
    try {
      const target = path.join(directory, name), stat = await fs.lstat(target);
      if (stat.isSymbolicLink() || !stat.isFile()) throw fault('缓存清单不是普通文件。');
      const data = JSON.parse(await fs.readFile(target, 'utf8'));
      return data && typeof data === 'object' && !Array.isArray(data) ? data : fallback;
    } catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return fallback; throw error; }
  }

  async writeJSON(directory, name, value) {
    const temporary = path.join(directory, `${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, JSON.stringify(value), { flag: 'wx' });
      await fs.rename(temporary, path.join(directory, name));
    } finally { await fs.unlink(temporary).catch(() => {}); }
  }

  async load() {
    if (this.loaded) return;
    try {
      const dir = await this.cacheDirectory();
      const catalog = await this.readJSON(dir, 'catalog.json', {});
      for (const relative of Array.isArray(catalog.directories) ? catalog.directories : []) {
        if (typeof relative === 'string' && !relative.split(/[\\/]/).includes(CACHE_FOLDER)) this.directories.add(relative);
      }
      if (Number.isSafeInteger(catalog.maxBytes) && catalog.maxBytes >= 65536) this.maxBytes = catalog.maxBytes;
      this.paused = catalog.paused === true;
      this.directories.add('');
      for (const relative of this.directories) {
        try {
          const cache = await this.cacheDirectory(relative);
          for (const name of await fs.readdir(cache)) {
            if (temporaryFile.test(name)) await this.removeFile(cache, name);
          }
        } catch { /* Missing/moved directories remain discoverable in the management view. */ }
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    this.loaded = true;
  }

  async saveCatalog() {
    const directory = await this.cacheDirectory('', true);
    this.directories.add('');
    await this.writeJSON(directory, 'catalog.json', {
      owner: OWNER, directories: [...this.directories], maxBytes: this.maxBytes, paused: this.paused,
    });
  }

  async removeFile(directory, name) {
    if (!imageFile.test(name) && !temporaryFile.test(name)) throw fault('拒绝删除非缓存文件。');
    const target = path.join(directory, name);
    try {
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw fault('拒绝删除链接或非普通缓存文件。');
      await fs.unlink(target);
      return stat.size;
    } catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
  }

  async inventory() {
    const directories = [], files = [];
    let bytes = 0;
    for (const relative of this.directories) {
      try {
        const directory = await this.cacheDirectory(relative);
        let directoryBytes = 0, count = 0;
        const manifest = await this.readJSON(directory, 'manifest.json', {});
        for (const name of await fs.readdir(directory)) {
          const stat = await fs.lstat(path.join(directory, name));
          if (!stat.isFile() || stat.isSymbolicLink()) continue;
          directoryBytes += stat.size;
          if (imageFile.test(name)) {
            count++;
            files.push({ directory, relative, name, size: stat.size, accessed: manifest[name]?.accessed || stat.mtimeMs });
          }
        }
        bytes += directoryBytes;
        directories.push({ path: relative, location: directory, bytes: directoryBytes, count });
      } catch (error) { directories.push({ path: relative, error: error.message }); }
    }
    return { bytes, files, directories };
  }

  async makeRoom(reserve = 0) {
    let data = await this.inventory();
    for (const file of data.files.sort((a, b) => a.accessed - b.accessed)) {
      if (data.bytes + reserve <= this.maxBytes) break;
      await this.removeFile(file.directory, file.name);
      const manifest = await this.readJSON(file.directory, 'manifest.json', {});
      delete manifest[file.name];
      await this.writeJSON(file.directory, 'manifest.json', manifest);
      data = await this.inventory();
    }
    if (data.bytes + reserve > this.maxBytes) throw fault('缓存预算不足，请增加容量或清理缓存。', 507);
  }

  async source(relative) {
    const file = await resolveResource(this.root, relative);
    if (!IMAGE_TYPES.has(path.extname(file).toLowerCase())) throw fault('不支持的图片。', 404);
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw fault('图片不存在。', 404);
    const parent = portable(path.relative(this.root, path.dirname(file)));
    const name = createHash('sha256').update(path.basename(file)).digest('hex') + '.webp';
    return { file, parent, name, revision: version(stat) };
  }

  async request(relative) {
    await this.initialize();
    const source = await this.source(relative);
    const key = `${source.file}:${source.revision}`;
    // Hits remain readable while generation is paused.
    try {
      const directory = await this.cacheDirectory(source.parent);
      const manifest = await this.readJSON(directory, 'manifest.json', {});
      const entry = manifest[source.name];
      if (entry?.revision === source.revision && entry.recipe === RECIPE) {
        const target = path.join(directory, source.name), stat = await fs.lstat(target);
        if (!stat.isFile() || stat.isSymbolicLink()) throw fault('无效缓存文件。');
        // Buffer survives a concurrent purge, without keeping Windows file handles open.
        const buffer = await fs.readFile(target);
        const now = Date.now();
        if (!this.directories.has(source.parent) || now - (this.touched.get(target) || 0) > 60000) {
          this.touched.set(target, now);
          if (this.touched.size > 4096) this.touched.delete(this.touched.keys().next().value);
          const epoch = this.epoch;
          this.exclusive(async () => {
            if (epoch !== this.epoch) return;
            const cache = await this.cacheDirectory(source.parent);
            if (!this.directories.has(source.parent)) { this.directories.add(source.parent); await this.saveCatalog(); }
            const latest = await this.readJSON(cache, 'manifest.json', {});
            if (latest[source.name]?.revision === source.revision) {
              latest[source.name].accessed = now;
              await this.writeJSON(cache, 'manifest.json', latest);
            }
          }).catch(() => {});
        }
        return { buffer, etag: `"${source.name}-${source.revision}-${RECIPE}"` };
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (this.paused) throw fault('缩略图生成已暂停，请在缓存管理中恢复。', 409);
    let job = this.jobs.get(key);
    if (job?.error && job.expires < Date.now()) { this.jobs.delete(key); job = null; }
    if (job?.error) throw job.error;
    if (!job) {
      if (this.jobs.size >= 128) throw fault('生成队列繁忙，请稍后重试。', 429);
      job = { lease: Date.now() + 10000, epoch: this.epoch };
      this.jobs.set(key, job);
      this.exclusive(async () => {
        if (job.epoch !== this.epoch || this.paused || job.lease < Date.now()) return;
        this.active++;
        try {
          const directory = await this.cacheDirectory(source.parent, true);
          this.directories.add(source.parent);
          await this.saveCatalog(); // Register before creating any derived image.
          const buffer = await sharp(source.file, { limitInputPixels: 100_000_000, pages: 1 })
            .rotate().resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 78, effort: 2 }).toBuffer();
          if (job.epoch !== this.epoch || this.paused || (await this.source(relative)).revision !== source.revision) return;
          await this.makeRoom(buffer.length * 2 + 8192);
          const temporary = path.join(directory, `${randomUUID()}.tmp`);
          try {
            await fs.writeFile(temporary, buffer, { flag: 'wx' });
            if (job.epoch !== this.epoch || this.paused) return;
            await fs.rename(temporary, path.join(directory, source.name));
          } finally { await fs.unlink(temporary).catch(() => {}); }
          const manifest = await this.readJSON(directory, 'manifest.json', {});
          manifest[source.name] = { source: path.basename(source.file), revision: source.revision, recipe: RECIPE, size: buffer.length, accessed: Date.now() };
          await this.writeJSON(directory, 'manifest.json', manifest);
        } catch (error) {
          job.error = fault(`无法生成缩略图：${error.message}`, error.status || 422);
          job.expires = Date.now() + 15000;
        } finally { this.active--; }
      }).finally(() => {
        if (!job.error) this.jobs.delete(key);
        else {
          const timer = setTimeout(() => { if (this.jobs.get(key) === job) this.jobs.delete(key); }, 15000);
          timer.unref();
        }
      });
    } else job.lease = Date.now() + 10000;
    return { pending: true };
  }

  async status() {
    await this.initialize();
    const { bytes, directories, files } = await this.inventory();
    return { bytes, count: files.length, directories, maxBytes: this.maxBytes, paused: this.paused, queued: this.jobs.size, active: this.active };
  }

  async manage({ action, scope = '', maxBytes }) {
    if (!['clear', 'prune', 'scan', 'pause', 'resume', 'limit'].includes(action)) throw fault('未知缓存操作。', 400);
    await this.initialize();
    const absolute = await resolveResource(this.root, scope);
    if (!(await fs.stat(absolute)).isDirectory()) throw fault('请选择目录。', 400);
    const normalized = portable(path.relative(this.root, absolute));
    // Invalidate jobs before waiting for a running encoder to finish.
    if (['clear', 'pause'].includes(action)) { this.epoch++; this.paused = true; }
    return this.exclusive(async () => {
      let freedBytes = 0;
      const failures = [];
      if (action === 'resume') this.paused = false;
      if (action === 'limit') {
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 65536) throw fault('容量至少为 64 KiB。', 400);
        this.maxBytes = maxBytes;
      }
      if (action === 'scan') {
        const visit = async directory => {
          const entries = await fs.readdir(directory, { withFileTypes: true });
          if (entries.some(e => e.name === CACHE_FOLDER && e.isDirectory())) {
            const relative = portable(path.relative(this.root, directory));
            try { await this.cacheDirectory(relative); this.directories.add(relative); } catch (error) { failures.push({ path: relative, error: error.message }); }
          }
          for (const entry of entries) if (entry.isDirectory() && entry.name !== CACHE_FOLDER && !entry.isSymbolicLink()) await visit(path.join(directory, entry.name));
        };
        await visit(absolute);
      }
      if (['clear', 'prune'].includes(action)) {
        for (const relative of this.directories) {
          if (normalized && relative !== normalized && !relative.startsWith(normalized + '/')) continue;
          try {
            const directory = await this.cacheDirectory(relative), manifest = await this.readJSON(directory, 'manifest.json', {});
            for (const name of await fs.readdir(directory)) {
              if (!imageFile.test(name) && !temporaryFile.test(name)) continue;
              let stale = action === 'clear' || temporaryFile.test(name);
              if (!stale) {
                const entry = manifest[name];
                if (!entry || typeof entry.source !== 'string' || path.basename(entry.source) !== entry.source) stale = true;
                else {
                  try { stale = (await this.source(portable(path.join(relative, entry.source)))).revision !== entry.revision || entry.recipe !== RECIPE; }
                  catch { stale = true; }
                }
              }
              if (stale) {
                try { freedBytes += await this.removeFile(directory, name); delete manifest[name]; }
                catch (error) { failures.push({ path: path.join(directory, name), error: error.message }); }
              }
            }
            await this.writeJSON(directory, 'manifest.json', manifest);
          } catch (error) { failures.push({ path: relative, error: error.message }); }
        }
      }
      await this.saveCatalog();
      if (action === 'limit') await this.makeRoom();
      return { freedBytes, failures, paused: this.paused };
    });
  }
}
