# 缓存时效性修复方案

> 项目：FPL-2627YANMULEAGUE（26/27 烟幕二群联赛展示站）
> 日期：2026-09-15
> 状态：**设计阶段，尚未改动任何代码**

---

## 一、问题定性

不是"用了旧缓存"，而是**前端在伪造数据**。

GW4 获奖者于 2026-09-15 15:48 写入 `public/config.json` 并推送。配置经 `deploy.yml`（push 触发）分钟级上线，因此页面能正确显示 GW4 的头像与微信名。但阵容数据来自 `public/data/cachedSquads.json`，该文件由另一条独立的 30 分钟 cron 流水线生成，当时仍只含 GW1–3。

于是 `resolveSquad(4, '14156')` 缓存未命中，落到 `generateMockSquad('14156', 4)`，凭空生成一套阵容。

### 实测证据

| 项 | 实测值 |
| --- | --- |
| 线上 `config.json` → classicWinners | GW 1,2,3,**4** |
| 线上 `data/cachedSquads.json` → squads | GW 1,2,3（`_mode: "real"`） |
| GW4 真实阵容（FPL API 实拉） | **110 分**，队长 João Pedro，首发 Raya(14) / Konsa(6) / De Cuyper(11) |
| 前端实际展示（Mock 兜底） | **94 分**，队长 Gordon |
| `leagueStandings.json` 中 entry 14156 | `event_total: 110`（真实） |

→ 同一页面、同一人、同一轮，右栏排行榜显示 110 分，左栏阵容显示 94 分。

Mock 生成器使用真实球员名（Raya / Salah / Haaland…）配随机分数，产物外观与真实数据完全一致，用户无法分辨。

---

## 二、根因分析

### R1 两条流水线解耦（直接触发）

| 流水线 | 触发方式 | 生效延迟 |
| --- | --- | --- |
| `deploy.yml`（发配置） | push 到 main | 分钟级 |
| `update-fpl-cache.yml`（发数据） | cron `*/30 * * * *` | 最长 30 分钟+ |

配置先上线、数据后生成，中间存在空窗期。空窗期内前端静默使用 Mock。

### R2 Mock 兜底在语义上是"造假"而非"缺省"（最危险）

`src/data/mockSquads.js` 的确定性伪随机设计，本意是"模拟 FPL 数据稳定缓存"，但在真实部署中它掩盖了数据缺失。**正确行为应是显式空状态（宁缺毋假）。**

### R3 缓存无时效语义（架构缺陷）

`cachedSquads.json` 未记录任何时间或结算状态维度。

- 已结算轮次（GW1–3，`finished: true`）：快照永久有效 —— 这部分设计没问题，符合你的判断。
- 进行中轮次（GW4，`finished: false`）：快照天生是**临时值**，随着每场比赛结束而变化。

`_mode: "real"` 是**文件级全局标志**，无法表达"GW1-3 已结算真实 / GW4 结算中"这种逐轮差异。

### R4 构建脚本静默吞错（隐性风险）

`scripts/build-fpl-cache.js` 中单轮失败仅 `console.error` 后 `continue`，产物与上次完全一致 → CI 的 `git diff --quiet` 判定"无变化" → 不提交。失败彻底不可见，CI 仍然显示绿色。

### R5 注释与实现不符（小缺陷）

`update-fpl-cache.yml` 注释称"工作日每天 21:30（UTC 13:30）跑一次兜底"，实际 cron 为 `*/30 * * * *`（全天每 30 分钟）。

---

## 三、技术约束（决定方案边界）

已实测确认：**FPL 官方 API 无 CORS 头**

```
cross-origin-resource-policy: same-origin
（无 access-control-allow-origin）
```

两次独立验证（`bootstrap-static` 与 `entry/14156/event/4/picks/`）。浏览器无法直连，因此：

- ✅ 可行：提高构建/部署频率，缩短快照滞后
- ❌ 不可行：前端直接向 FPL 请求
- 🔶 唯一真·实时路径：引入代理层（本次不做，列为 Phase 2）

---

## 四、轮次状态三态模型（本次核心设计）

利用 `bootstrap-static.events[].finished` 与 `event/<gw>/live/.elements` 可无损区分三种状态。

实测验证：

| GW | `events[].finished` | `live.elements.length` | 状态判定 |
| --- | --- | --- | --- |
| 3 | `true` | 654 | 已结算 |
| 4 | `false` | 659 | 结算中 |
| 5 | `false` | **0** | 未开赛 |
| 6 | `false` | **0** | 未开赛 |

对应前端行为：

| 状态 | 判定条件 | 前端表现 | 是否轮询 |
| --- | --- | --- | --- |
| `settled` | `finished === true` | 正常渲染 + "数据来源：FPL 官方 API" | 否（终值） |
| `live` | `finished === false && live.elements.length > 0` | 正常渲染 + "结算中 · 更新于 HH:mm" | 是（5 分钟） |
| `pending` | `finished === false && live.elements.length === 0` | 空状态"本轮尚未开赛" | 是 |
| `missing` | 缓存中无该轮记录 | 空状态"数据生成中，请稍后刷新" | 是 |

---

## 五、改动清单

### 改动 1 · `scripts/build-fpl-cache.js` — 写入时效元数据 + 失败不再静默

**要点**

1. 复用已拉取的 `bootstrap.events` 判定结算状态，**零额外网络请求**。
2. 每条 squad 追加字段：
   - `status`: `'settled' | 'live' | 'pending'`
   - `fetchedAt`: ISO 时间戳
3. 文件级追加 `_generatedAt`，并在注释中明确 `_mode` 降级为"仅供参考，具体以逐轮 `status` 为准"。
4. 失败处理改造：
   - 收集 `failures: [{ gameweek, fplId, reason }]`
   - 写入产物 `_failures` 字段
   - 存在失败时 `process.exitCode = 1`（**让 CI 变红**），但仍写出产物，保住已成功轮次，避免雪崩

**示意**

```js
// Mock 模式无 bootstrap，一律标记 pending，避免伪造数据被当成已结算
const statusOf = (gw, live) => {
  const ev = events.get(gw);
  if (!ev) return 'pending';
  if (ev.finished) return 'settled';
  return (live?.elements?.length ?? 0) > 0 ? 'live' : 'pending';
};

squads.push({
  ...transformPicksToSquad({ fplId, gameweek, bootstrap, picks, live }),
  status: statusOf(gameweek, live),
  fetchedAt: new Date().toISOString(),
});
```

**注意**：`transformPicksToSquad` 当前签名不返回 `live`，需在调用点保留 `live` 引用用于判定（无需改动该函数本身）。

---

### 改动 2 · `src/services/squadService.js` — 停止造假，改为显式状态

**现状**：缓存未命中 → `generateMockSquad()` 生成伪数据。

**改后**

- `resolveSquad()` 返回值扩展为 `{ squad, source, status, label, updatedAt }`
- `source`: `'cache' | 'missing'`
- 缓存未命中时返回 `squad: null` + `source: 'missing'`，**不再调用 Mock**
- Mock 仅在**显式演示模式**下启用，默认关闭：

```js
const DEMO_MOCK = import.meta.env.VITE_DEMO_MOCK === 'true';
```

（保留 `src/data/mockSquads.js` 及其在构建脚本 Mock 模式中的用途，只是切断"真实部署下自动兜底"这条路径。）

- `loadCachedSquads()` 的 Promise 永久 memoize 需改为**带 TTL 的缓存**：
  - 若全部轮次均为 `settled` → 不重拉
  - 若存在 `live` / `pending` / `missing` 轮次 → TTL 5 分钟
  - 实现上可直接复用一个 `{ data, expiresAt }` 的内存结构

---

### 改动 3 · `src/components/ClassicWinnerList.js` — 空状态与进行中标识

1. `loadDetail()` 中处理 `squad === null`：渲染"本轮结算中 / 数据生成中"空状态，**不再调用 `renderSquad()`**
2. 折叠行右侧状态徽标扩展为三态：`已公布` / `结算中` / `暂未公布`
3. 展开区的数据来源标签展示 `fetchedAt`（如"结算中 · 更新于 16:05"）
4. 折叠行分数：`settled` / `live` 显示分数，`pending` / `missing` 显示 `—`（当前已是 `—` 逻辑，保持）

---

### 改动 4 · `.github/workflows/update-fpl-cache.yml` — 流水线加固

```yaml
on:
  schedule:
    - cron: '*/5 * * * *'
  push:
    paths:
      - 'public/config.json'
      - 'scripts/build-fpl-cache.js'
      - 'scripts/build-league-standings.js'
  workflow_dispatch:

concurrency:
  group: fpl-cache
  cancel-in-progress: false
```

**关键点**

1. **`push.paths` 让配置一变更就立刻重建**，不再等下一个 30 分钟窗口。这是把空窗期从"30 分钟"压到"2–3 分钟"的主力。
2. **防循环**：bot 提交只改 `public/data/**`，不在 `paths` 白名单内，天然不会自触发。建议再加一道保险：
   ```yaml
   if: github.actor != 'github-actions[bot]'
   ```
3. **cron 提到 5 分钟**作为兜底（注意 GitHub 定时任务高峰期会延迟，不能依赖其精确性）。
4. **`concurrency`** 防止手动触发与定时触发并发写同一文件导致 push 冲突。
5. **注释订正**为与实际 cron 一致。
6. 失败可见性：因改动 1 已让脚本在失败时返回非 0 退出码，CI 会自然变红。建议追加一步在失败时打印 `_failures`：

```yaml
      - name: 有失败轮次时输出诊断
        if: failure()
        run: cat public/data/cachedSquads.json | head -50
```

---

### 改动 5 · `README.md` — 文档同步

- 更新数据流章节：补充三态模型说明
- 明确写出纯静态方案的**滞后上限**（受 CI 调度 + 构建 + Pages 部署 + CDN 缓存影响，实测约 2–3 分钟）
- 说明 `VITE_DEMO_MOCK` 的用途

---

## 六、实施顺序（建议三个独立提交）

| 提交 | 内容 | 效果 |
| --- | --- | --- |
| **C1 前端止损** | 改动 2（切断 Mock）+ 改动 3（空状态） | 立刻消除假数据。行为从"静默造假"变为"宁缺毋假" |
| **C2 时效语义** | 改动 1（元数据 + 退出码）+ 前端读取 `status`/`fetchedAt` + 轮询 | 页面能区分"结算中/已结算"，并自动跟进 |
| **C3 流水线加固** | 改动 4 + 改动 5 | 空窗期压到 2–3 分钟，失败可见 |

C1 与 C2 的前端部分有耦合（都改 `squadService` / `ClassicWinnerList`），若嫌麻烦可合并为一次提交；但 C1 单独上线即可立刻止损，建议保留拆分。

---

## 七、验收标准

- [ ] GW4 缓存缺失时，页面显示"数据生成中"，**页面上不出现任何编造的分数**
- [ ] GW4 缓存存在且 `status: 'live'` 时，标签显示"结算中 · 更新于 HH:mm"，且每 5 分钟自动重拉
- [ ] GW1–3（`status: 'settled'`）永不重拉，标签显示"数据来源：FPL 官方 API"
- [ ] 修改 `public/config.json` 并 push 后，≤3 分钟内缓存自动重建
- [ ] 构建脚本任一轮失败 → CI 变红，`_failures` 可在日志中查阅
- [ ] 排行榜分数与阵容总分在 GW4 上一致（110 = 110）

---

## 八、风险与限制

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| GitHub Actions 定时不精确 | 高峰期 `*/5` 可能延迟到 10–15 分钟 | push 触发为主力，cron 仅兜底 |
| Pages CDN 缓存 | 前端轮询可能拿到 CDN 旧副本 | 可接受（数据源本身即快照）；README 写明 |
| 关闭 Mock 后本地无示例数据 | 影响本地演示体验 | 用 `VITE_DEMO_MOCK=true` 保留 |
| 结算中的快照仍会滞后 | 静态方案固有上限，无法做到逐场比赛实时 | Phase 2 引入代理 |

---

## 九、Phase 2（本次不做，备选）

若后续要求"GW 结算期逐场比赛实时更新"，需引入运行时代理：

- **Cloudflare Worker** 或 **Vercel Serverless Function** 转发 FPL API
- 前端逻辑：`settled` 轮次读静态缓存，`live` 轮次走代理实时拉取
- 代价：新增一个部署目标与运维面；收益：消除快照滞后

建议先落地 Phase 1，用真实使用数据判断是否值得投入 Phase 2。
