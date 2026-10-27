# 后端资源服务

独立的 Node.js HTTP 服务，不托管前端，不依赖 Vue 或 Vite。需要 Node.js 22.12 或更高版本，以下命令均在 `backend/` 中执行。

```powershell
npm ci
npm start -- --dir "D:\Pictures"
```

本项目没有第三方运行时依赖，也可直接运行 `node server.js --dir "D:\Pictures"`。

## 开发和配置

```powershell
npm run dev -- --dir "D:\Pictures" --port 9000
npm test
```

`dev` 使用 Node 的文件监听功能自动重启服务。默认端口 8080，监听 `0.0.0.0`。目录参数支持 `--dir`/`-d` 或位置参数；端口支持 `--port`/`-p`。环境变量 `GALLERY_DIR`、`PORT` 提供默认值。未指定目录时使用当前工作目录，即通常为 `backend/`。

## 接口

- `GET /api/browse?path=相册`：获取目录下的 `folders`、`images`、`videos`，以及 `directory`、`currentPath`。路径相对于指定媒体根目录。
- `GET /image/<编码后的相对路径>`：获取图片。
- `GET /video/<编码后的相对路径>`：获取视频。
- 资源支持 HEAD 与单段字节 Range；无效范围返回 416。

资源路径使用 `/` 分隔，响应中的媒体 URL 可直接使用。目录边界检查包括符号链接的实际路径。访问后端根路径 `/` 返回 404，网页由独立前端提供。

图片支持 JPG、JPEG、PNG、GIF、WebP、AVIF、SVG、BMP、ICO；视频支持 MP4、M4V、WebM、OGV、OGG、MOV、MKV。具体编码能否播放取决于浏览器。

`tests/` 使用 Node 内置测试框架，覆盖目录读取、路径编码与访问边界、命令行参数以及视频分段读取。

该服务用于可信局域网，无登录功能。其他设备需处于同一局域网，允许 Node.js 通过防火墙的专用网络。
