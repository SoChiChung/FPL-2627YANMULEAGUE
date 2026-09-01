# FPL 私人联赛展示站

「18岁的蓝在sunny时刻——26/27烟幕二群联赛」的 FPL 私人联赛展示页，部署于 GitHub Pages。
深藏青 × 奶黄 × 蓝紫的报纸风格主题，桌面双栏 / 移动端单列。

## 页面展示功能

**顶部 Header（吸顶）**
- 联赛名称与赛季，当前轮次徽标（如 GW3）
- 状态：未截止 / 已完成（徽标永远指向下一个未到 DDL 的轮次，与 FPL App 一致）
- 上一轮"已结束"提示 + 下一轮 Deadline 倒计时，所有时间按**北京时间**显示

**Classic Weekly Winner（左栏）**
- 38 轮纵向手风琴列表，一行一轮：头像 / GW / 分数 / 微信名 / 是否已公布
- 点击展开：FPL ID、该轮完整阵容（GK / DEF / MID / FWD / Bench 分组，含 C / VC 队长标识、球员俱乐部与得分）
- 阵容下方展示本轮竖屏颁奖图缩略图（3:4 比例），点击新窗口查看大图
- 未公布的轮次折叠显示"暂未公布"，展开显示空状态

**Picks 3 Weekly Winner（右栏）**
- 当前累计奖池 + 每轮基础加池记录（每轮 +5 元，无人猜中则累计，猜中者拿走当前奖池并清零）
- 按 GW 纵向排列每轮结果：无人获奖 / 获奖者（含头像）与金额 / 未开奖

**竞猜排行榜（右栏）**
- 累计奖池 + 总榜：由 config 中的**原始竞猜记录自动汇总**（金额降序 → 获奖次数降序 → 配置顺序），无需手工维护排名数组
- 头像统一复用 Picks 3 的头像（`pick3weeklywinner/`），匹配不到显示名字首字占位

**联赛分数排名（右栏）**
- Classic 联赛（12968）的"单轮分数前十"与"总分前十"，含名次升降标识
- 数据由构建脚本从 FPL API 拉取缓存，前端只读；缓存缺失时自动降级尝试直连 → Mock

**联赛规则 / 竞猜规则（右栏末尾）**
- 联赛规则（参赛资格、周最佳与赛季奖金、Daka 进球奖、名次奖金等）
- 竞猜规则（选人结构、获奖条件、身价与提交时间排序、解释权）

## 快速开始

```bash
npm install
npm start
```

打开 http://localhost:5173 预览（如端口被占用会自动换端口）。生产构建：

```bash
npm run build        # 输出到 dist/
npm run preview      # 本地预览构建产物
```

## 数据流（为什么没有后端）

GitHub Pages 没有后端，页面运行时**只读静态文件**，浏览器不发任何外部请求。
注意：FPL 官方 API **未开放 CORS**（已实测，响应无 `Access-Control-Allow-Origin`），
浏览器端无法直接按 fplId 请求，所以真实数据由构建脚本在服务端拉取：

1. 管理员维护 `public/config.json`（获奖者 FPL ID / 微信名 / 图片 baseName 等）
2. 同步真实 DDL 并生成缓存：

```bash
npm run sync:gameweeks    # 从 bootstrap-static 同步真实 DDL（转北京时间）到 config.json
npm run build:cache       # Mock 模式（本地演示，无需联网）
npm run build:cache:real  # 真实模式：按 config 里的 fplId 请求 FPL API 生成真实阵容
npm run build:standings   # 拉取 Classic 联赛 12968 排名，生成 data/leagueStandings.json
```

3. 产物写入 `public/data/cachedSquads.json`（头部 `_mode: "real"` 标记真实数据），随仓库提交
4. GitHub Actions（`.github/workflows/update-fpl-cache.yml`）每轮 Deadline 后自动执行第 2、3 步

前端读取优先级：

- 阵容：`data/cachedSquads.json` 缓存（真实数据）→ Mock 生成兜底
- 联赛分数排名：`data/leagueStandings.json` 缓存 → FPL standings API 尝试直连 → Mock 兜底

时间显示：所有 DDL 统一按**北京时间（UTC+8）**解析与显示，不随访问者时区变化。

## 资源目录（文件放在 public/ 下，代码里路径不带 public/）

| 用途 | 目录 | 匹配方式 |
| --- | --- | --- |
| Classic 周最佳头像 | `public/assets/classicweeklywinneravatar/` | `avatarBaseName`，如 `GW1` |
| Classic 周最佳颁奖图（竖屏） | `public/assets/classicweeklywinnerwords/` | `awardImageBaseName`，如 `GW1` |
| Picks 3 获奖者图片 | `public/assets/pick3weeklywinner/` | `avatarBaseName`，如 `GW2`（竞猜排行榜复用） |

图片扩展名不写死：`resolveImageByBaseName()`（`src/utils/image.js`）按
`.webp → .jpg → .jpeg → .png` 顺序逐个尝试，并兼容大小写（配置 `GW1`、文件 `gw1.jpg` 也能命中）。
全部失败时显示名字首字占位 / "颁奖图待上传"空状态。

字体（可选）：把 `江西拙楷.ttf` / `刻石录颜体.ttf` 放入 `src/styles/fonts/`
即可启用主题楷体 / 颜体；未放置时自动降级本地楷体。

## 配置结构（public/config.json）

```jsonc
{
  "league": { "name": "...", "season": "2026/27", "totalGameweeks": 38, "classicLeagueId": 12968 },
  "gameweeks": [{ "gameweek": 1, "deadline": "2026-08-15T18:30:00+08:00" }],
  "classicWinners": [
    { "gameweek": 1, "fplId": "18092", "wechatName": "某某",
      "avatarBaseName": "GW1", "awardImageBaseName": "GW1" }
  ],
  "picks3WeeklyWinners": [
    { "gameweek": 2, "winnerName": "Ryyyy", "avatarBaseName": "GW2" }
  ],
  "picks3PrizePool": { "basePrizePerWeek": 5, "currentGameweek": 2 },
  "predictionLeaderboard": {
    "totalPrizePool": 190,
    "entries": [  // 原始竞猜记录：一条 = 一次获奖，总榜由前端自动汇总
      { "username": "Ryyyy", "awardImageBaseName": "GW2", "prediction": "pick3获奖", "prize": 10 }
    ]
  }
}
```

- `picks3PrizePool.currentGameweek`：奖池推进到哪一轮（留空则取当前解析轮）
- Picks 3 奖池规则实现于 `src/services/picks3Service.js`：
  每轮 +`basePrizePerWeek` 元，无人猜中则累计；有人猜中拿走当前奖池并清零，下一轮重新累计
- 竞猜总榜计算实现于 `src/services/predictionService.js`（金额降序 → 次数降序 → 配置顺序），
  原始记录与计算结果分离，不写回配置文件

## 设计稿 Mock（可选）

`npm run build:mock` 从当前配置生成零 JS 的静态设计稿 `mock/`（已 gitignore，不入库），
包含全部模块的静态渲染，方便交给 Open Design 等工具重写样式。

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
│   ├── data/cachedSquads.json  # 阵容缓存（构建产物，前端只读）
│   ├── data/leagueStandings.json # Classic 联赛排名缓存
│   └── assets/             # 头像 / 颁奖图
├── src/
│   ├── main.js             # 组合根
│   ├── styles/             # theme → base → layout → components（+ fonts/ 可选字体）
│   ├── data/               # mockConfig（兜底）+ mockSquads（生成器）
│   ├── services/           # config / squad / prediction / picks3 / leagueStandings / fplApiClient
│   ├── utils/              # date / countdown / gameweek / image
│   └── components/         # Header / ClassicWinnerList / SquadView / Picks3Module / LeagueStandings / LeagueRules / ...
└── scripts/                # build-fpl-cache / sync-gameweeks / build-league-standings / build-mock-html
```
