# 画廊前端

独立的 Vue 3 + Vite 项目。源码、依赖、Vite 配置、Playwright 配置、测试和构建产物均位于本目录。需要 Node.js 22.12 或更高版本，以下命令均在 `web/` 中执行。

## 开发

```powershell
npm ci
npm run dev
```

访问 http://localhost:5173，支持 Vue 热更新。先在另一个终端启动后端资源服务。

`vite.config.js` 默认将 `/api`、`/image`、`/video` 代理到 `http://127.0.0.1:8080`。后端地址不同时，启动前配置：

```powershell
$env:GALLERY_API_URL = "http://127.0.0.1:9000"
npm run dev
```

也可连接其他机器上的后端。该变量供开发/预览服务器读取，不写入浏览器代码；手机通过前端局域网地址访问即可。前端运行不依赖 `backend/` 源码，只需要后端 HTTP 接口。

## 构建与预览

```powershell
npm run build
npm run preview
```

构建产物位于本目录的 `dist/`，预览地址为 http://localhost:4173。预览同样支持 `GALLERY_API_URL`，且需要后端已启动。

正式部署时使用 Nginx 等静态服务器托管 `dist/`，把 `/api/`、`/image/`、`/video/` 反向代理到后端并保留 Range 请求头。Vite preview 用于本地检查构建产物。

## 测试

```powershell
npm run build
npx playwright install chromium
npm run test:e2e
```

也可使用已安装的 Chrome：

```powershell
$env:PLAYWRIGHT_CHANNEL = "chrome"
npm run test:e2e
```

端到端测试会自动启动测试后端（18080）和前端构建预览（14173）。仅这些集成测试引用相邻的 `../backend/` 源码，需要保留仓库的前后端目录布局。测试生成的媒体位于本目录 `.test-media/`，截图和跟踪位于 `test-results/`；测试结束会关闭两个测试服务。

覆盖目录导航、刷新与历史记录、错误重试、图片切换/缩放/拖动、移动端滑动/双指缩放、原生视频播放和离屏缩略图资源释放。

## 源码

- `src/components/`：面包屑、媒体网格、卡片、预览弹层。
- `src/composables/`：目录与历史记录状态、图片手势。
- `src/styles/main.css`：暗色主题与响应式布局。

Vue 编译使用 `@vitejs/plugin-vue`，不需要额外的路由或全局状态库。
