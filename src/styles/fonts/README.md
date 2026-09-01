# 字体文件夹

把以下字体文件放进本目录（`src/styles/fonts/`），页面会自动使用；
不放也不影响功能，会降级到本地楷体（STKaiti / KaiTi）。

`@font-face` 已在 `src/styles/theme.css` 中声明，引用路径为相对本目录的 `fonts/`，
两种命名任选其一（都放也可以，中文名优先）：

- `江西拙楷.ttf` 或 `JiangXiZhuoKai.ttf`
- `刻石录颜体.ttf` 或 `KeShiLuYanTi.ttf`

说明：

- 字体文件随仓库一起提交（GitHub Pages 部署时自动带上，Vite 构建会打包到产物中）
- mock 静态稿（`mock/`）通过 `npm run build:mock` 生成时会把本目录一并拷贝过去
- 字体版权归原作者所有，请确认使用授权后再上传
