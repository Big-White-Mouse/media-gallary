# 画廊前端

独立的 Vue 3 + Vite 项目。源码、依赖、Vite 配置和构建产物均位于本目录。需要 Node.js 22.12 或更高版本，以下命令均在 `web/` 中执行。

## 开发

```powershell
npm ci
npm run dev
```

访问 http://localhost:5173，支持 Vue 热更新。先在另一个终端启动后端资源服务。

`vite.config.js` 默认将 `/api`、`/image`、`/video`、`/thumbnail` 代理到 `http://127.0.0.1:8080`。后端地址不同时，启动前配置：

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

正式部署时使用 Nginx 等静态服务器托管 `dist/`，把 `/api/`、`/image/`、`/video/`、`/thumbnail/` 反向代理到后端并保留 Range 和条件请求头。Vite preview 用于本地检查构建产物。

## 源码

- `src/components/`：面包屑、媒体网格、卡片、预览弹层。
- `src/composables/`：目录与历史记录状态、图片手势。
- `src/styles/main.css`：暗色主题与响应式布局。

Vue 编译使用 `@vitejs/plugin-vue`，不需要额外的路由或全局状态库。

## 加载与交互

列表采用虚拟网格，只挂载视口附近的卡片，支持方向键和 Home/End 导航。图片列表仅请求缩略图；查看器复用缩略图，稳定停留 150ms 后只请求当前原图。邻图不自动下载原图。图片完成解码后分帧提交，手势期间延后清晰度升级，保持缩放位置。

`services/requestScheduler.js` 管理并发/取消，`imageResources.js` 管理共享下载、解码和有界内存，`renderCoordinator.js` 控制局部显示提交。`useImageGestures.js` 在独立控制器中处理指针，按帧写 transform，不让每次移动触发 Vue 更新。打开查看器或缓存面板时，背景媒体停止发起加载。

管理按钮可以定位、限制和清理电脑端的缩略图；浏览器 HTTP 缓存由浏览器管理，两者不同。
