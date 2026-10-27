import path from 'node:path';

export function parseArgs(argv, env = process.env) {
  let directory = env.GALLERY_DIR || process.cwd();
  let port = Number(env.PORT ?? 8080);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (['--dir', '-d', '--port', '-p'].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith('-')) throw new Error(`参数 ${arg} 缺少有效值。`);
      if (arg === '--dir' || arg === '-d') directory = value;
      else port = Number(value);
    }
    else if (arg.startsWith('-')) throw new Error(`未知参数：${arg}`);
    else directory = arg;
  }
  if (!directory) throw new Error('缺少媒体目录。');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('端口必须是 1 到 65535 之间的整数。');
  }
  return { directory: path.resolve(directory), port };
}
