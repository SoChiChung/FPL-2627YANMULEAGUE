/* ============================================================
 * src/utils/image.js — 头像 / 图片处理
 *
 * 展示规范：
 *   · 固定尺寸 + object-fit: cover（见 components.css 的 .avatar），
 *     防止图片把布局撑开
 *   · 加载失败（文件缺失 / 网络失败）时替换为“名字首字”占位
 *
 * 扩展名匹配规则（GitHub Pages 静态环境无法扫描目录）：
 *   配置里只写 baseName（如 GW1），resolveImageByBaseName() 按
 *   IMAGE_EXTENSIONS 顺序逐个尝试加载，哪个成功用哪个；
 *   同时兼容大小写（配置 GW1，文件实际是 gw1.jpg 也能命中）。
 *
 * 上传压缩规范（接入上传功能前必读）：
 *   真实头像应在上传前（或后台）压缩，避免原始照片直接进仓库：
 *   1. 限制最大宽高：如 200×200，等比缩放
 *   2. 统一格式：JPEG 或 WebP（透明头像转 PNG）
 *   3. 压缩质量：约 0.8，肉眼无损但体积大幅下降
 *   4. 命名：<baseName>.<ext>，避免中文名
 *   compressAvatar() 是前端 canvas 压缩参考实现；GitHub Pages 无后端，
 *   更推荐后台工具 / 构建脚本压缩后提交。
 * ============================================================ */

/** 候选扩展名（按序尝试，不写死图片格式） */
export const IMAGE_EXTENSIONS = ['.webp', '.jpg', '.jpeg', '.png'];

/**
 * 前端资源目录映射。
 * 文件真实存放位置在 public/ 下（Vite public 目录），
 * 但运行时访问路径不带 public/ 前缀（Vite dev 与构建产物一致）。
 */
export const ASSET_DIRS = {
  classicWinnerAvatar: 'assets/classicweeklywinneravatar',
  classicWinnerWords: 'assets/classicweeklywinnerwords',
  picks3Winner: 'assets/pick3weeklywinner',
};

const imageUrlCache = new Map();

/** 探测某个 URL 是否能成功加载为图片 */
function probeImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/**
 * 按 baseName 匹配图片（不写死扩展名）。
 * 依次尝试 IMAGE_EXTENSIONS × 大小写变体，成功即返回 URL；
 * 全部失败返回 null，由调用方显示默认占位图或空状态。
 * 结果按 (directory, baseName) 缓存，避免重复探测。
 */
export async function resolveImageByBaseName(directory, baseName) {
  if (!baseName) return null;

  const cacheKey = `${directory}/${baseName}`;
  if (imageUrlCache.has(cacheKey)) return imageUrlCache.get(cacheKey);

  const variants = [baseName, baseName.toLowerCase()];
  for (const name of variants) {
    for (const ext of IMAGE_EXTENSIONS) {
      const url = `${directory}/${name}${ext}`;
      if (await probeImage(url)) {
        imageUrlCache.set(cacheKey, url);
        return url;
      }
    }
  }

  imageUrlCache.set(cacheKey, null);
  return null;
}

/** 生成“名字首字”占位头像（图片缺失 / 加载失败时使用） */
export function makeAvatarFallback(name, extraClass = '') {
  const span = document.createElement('span');
  span.className = `avatar ${extraClass} avatar-fallback`.trim();
  span.textContent = (name || '?').trim().charAt(0) || '?';
  return span;
}

/** 给容器内所有 .avatar 图片绑定失败占位 */
export function bindAvatarFallback(container) {
  container.querySelectorAll('img.avatar').forEach((img) => {
    img.addEventListener('error', () => handleAvatarError(img), { once: true });
  });
}

function handleAvatarError(img) {
  const name = img.getAttribute('data-name') || '?';
  img.replaceWith(makeAvatarFallback(name, img.className.replace(/\bavatar\b/, '')));
}

/** 前端 canvas 压缩参考实现（预留，当前未接入上传） */
export async function compressAvatar(file, maxSize = 200, quality = 0.8) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  // 得到压缩后的 Blob：可用于预览、转 dataURL 或上传
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}
