import { defineConfig } from 'vite';

// base: './' —— 相对路径构建产物，GitHub Pages 项目站点
// （https://<user>.github.io/<repo>/ 子路径）也能直接使用。
// public/ 目录里的文件（config.json / data / assets）在 dev 下
// 以根路径提供，build 时原样拷贝到 dist/。
export default defineConfig({
  base: './',
  server: {
    // 默认 5173；被占用时（如用户已运行 npm start）可由预览工具通过 PORT 分配空闲端口
    port: Number(process.env.PORT) || 5173,
  },
});
