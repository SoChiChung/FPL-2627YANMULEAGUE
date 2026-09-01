# FPL 私人联赛展示站

FPL 私人联赛（Classic Weekly Winner / Picks 3 / 竞猜排行榜）静态展示页，部署于 GitHub Pages。

## 快速开始

```bash
npm install
npm start
```

打开 http://localhost:5173 预览。生产构建：

```bash
npm run build        # 输出到 dist/
npm run preview      # 本地预览构建产物
```

## 数据流（为什么没有后端）

GitHub Pages 没有后端，页面运行时**只读静态文件**，浏览器不发任何外部请求。
注意：FPL 官方 API **未开放 CORS**（已实测，响应无 `Access-Control-Allow-Origin`），
浏览器端无法直接按 fplId 请求，所以真实数据由构建脚本在服务端拉取：

1. 管理员维护 `public/config.json`（获奖者 FPL ID / 微信名 / 图片 baseName 等）
2. 同步真实 DDL 并生成阵容缓存：

```bash
npm run sync:gameweeks    # 从 bootstrap-static 同步真实 DDL（转北京时间）到 config.json
npm run build:cache       # Mock 模式（本地演示，无需联网）
npm run build:cache:real  # 真实模式：按 config 里的 fplId 请求 FPL API 生成真实阵容
```

3. 产物写入 `public/data/cachedSquads.json`（头部 `_mode: "real"` 标记真实数据），随仓库提交
4. GitHub Actions（`.github/workflows/update-fpl-cache.yml`）每轮 Deadline 后自动执行第 2、3 步

前端读取优先级：`data/cachedSquads.json` 缓存（真实数据）→ Mock 生成兜底。

时间显示：所有 DDL 统一按**北京时间（UTC+8）**解析与显示，
不随访问者时区变化；`npm run sync:gameweeks` 写入的即为 +08:00 偏移。

## 资源目录（文件放在 public/ 下，代码里路径不带 public/）

| 用途 | 目录 | 匹配方式 |
| --- | --- | --- |
| Classic 周最佳头像 | `public/assets/classicweeklywinneravatar/` | `avatarBaseName`，如 `GW1` |
| Classic 周最佳颁奖图（竖屏） | `public/assets/classicweeklywinnerwords/` | `awardImageBaseName`，如 `GW1` |
| Picks 3 获奖者图片 | `public/assets/pick3weeklywinner/` | `avatarBaseName`，如 `GW2` |

图片扩展名不写死：`resolveImageByBaseName()`（`src/utils/image.js`）按
`.webp → .jpg → .jpeg → .png` 顺序逐个尝试，并兼容大小写（配置 `GW1`、文件 `gw1.jpg` 也能命中）。
全部失败时显示名字首字占位 / “颁奖图待上传”空状态。

## 配置结构（public/config.json）

```jsonc
{
  "league": { "name": "...", "season": "2026/27", "totalGameweeks": 38 },
  "gameweeks": [{ "gameweek": 1, "deadline": "2026-08-15T18:30:00+08:00" }],
  "classicWinners": [
    { "gameweek": 1, "fplId": "18092", "wechatName": "某某",
      "avatarBaseName": "GW1", "awardImageBaseName": "GW1" }
  ],
  "picks3WeeklyWinners": [
    { "gameweek": 2, "winnerName": "Ryyyy", "avatarBaseName": "GW2" }
  ],
  "picks3PrizePool": { "basePrizePerWeek": 5, "currentGameweek": 2 },
  "predictionLeaderboard": { "totalPrizePool": 190, "entries": [...] }
}
```

- `picks3PrizePool.currentGameweek`：奖池推进到哪一轮（留空则取当前解析轮）
- Picks 3 奖池规则实现于 `src/services/picks3Service.js`：
  每轮 +`basePrizePerWeek` 元，无人猜中则累计；有人猜中拿走当前奖池并清零，下一轮重新累计

## 部署到 GitHub Pages

方式 A（推荐，自动构建）：Settings → Pages → Source 选 **GitHub Actions**，
推送 `main` 分支后由 `.github/workflows/deploy.yml` 自动 `npm run build` 并发布 `dist/`。

方式 B（手动）：`npm run build` 后把 `dist/` 内容推到任意分支 / 目录部署。
`vite.config.js` 已设 `base: './'`，项目子路径（`https://<user>.github.io/<repo>/`）可用。

## 目录结构

```
├── index.html / package.json / vite.config.js
├── public/                 # Vite public 目录（运行时路径不带 public/ 前缀）
│   ├── config.json         # 管理员主配置
│   ├── data/cachedSquads.json  # 构建产物，前端只读
│   └── assets/             # 头像 / 颁奖图
├── src/
│   ├── main.js             # 组合根
│   ├── styles/             # theme → base → layout → components
│   ├── data/               # mockConfig（兜底）+ mockSquads（生成器）
│   ├── services/           # config / squad / prediction / picks3 / fplApiClient
│   ├── utils/              # date / countdown / gameweek / image
│   └── components/         # Header / ClassicWinnerList / SquadView / Picks3Module / ...
└── scripts/build-fpl-cache.js  # FPL API → 静态缓存构建器
```
