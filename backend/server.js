import os from 'node:os';
import { parseArgs } from './config.js';
import { createGalleryServer } from './app.js';

try {
  const options = parseArgs(process.argv.slice(2));
  const server = await createGalleryServer(options);
  server.on('error', (error) => {
    console.error(`后端启动失败：${error.message}`);
    process.exitCode = 1;
  });
  server.listen(options.port, '0.0.0.0', () => {
    const addresses = new Set(['localhost']);
    for (const group of Object.values(os.networkInterfaces())) {
      for (const address of group || []) {
        if (address.family === 'IPv4' && !address.internal) addresses.add(address.address);
      }
    }
    console.log(`\n媒体目录：${options.directory}\n后端资源服务：`);
    for (const address of addresses) console.log(`  http://${address}:${options.port}/api/browse`);
    console.log('\n请在 web 目录启动前端：npm run dev。');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => { server.close(); server.closeAllConnections(); });
  }
} catch (error) {
  console.error(`后端启动失败：${error.message}`);
  process.exitCode = 1;
}
