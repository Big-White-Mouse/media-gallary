# LAN Gallery

局域网图片与视频画廊，分为两个独立项目：

- [backend/](backend/README.md)：Node.js 资源服务，提供目录接口、图片、视频和 Range 分段读取。
- [web/](web/README.md)：Vue 3 + Vite 前端，负责目录浏览和媒体预览。

两个项目各自拥有 `package.json`、锁文件、配置及测试。根目录只保留项目说明和公共忽略规则，没有 npm workspace、统一依赖或启动脚本。需要 Node.js 22.12 或更高版本。

## 启动

在两个终端分别运行：

```powershell
# 终端一：后端
cd backend
npm ci
npm start -- --dir "D:\Pictures"
```

```powershell
# 终端二：前端
cd web
npm ci
npm run dev
```

访问 http://localhost:5173；手机使用终端显示的局域网前端地址。后端默认端口为 8080，前端通过代理访问资源。

## 项目结构

```text
backend/
  package.json
  package-lock.json
  README.md
  app.js
  config.js
  media.js
  server.js
  tests/
web/
  package.json
  package-lock.json
  README.md
  vite.config.js
  playwright.config.js
  index.html
  src/
  tests/e2e/
  dist/                  前端构建产物（不提交）
README.md
.gitignore
```

保留暗色主题、响应式布局、面包屑导航、图片键盘/滑动切换、双击/双指缩放、放大拖动、原生视频播放、视频封面懒加载和浏览器返回操作。
