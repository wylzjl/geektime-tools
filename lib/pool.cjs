'use strict';

/** 并发受限的 async map：至多 limit 个任务同时执行，保持输入顺序 */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

/** 指数退避重试：retries 次重试，间隔 baseDelay * 2^attempt */
async function withRetry(fn, { retries = 2, baseDelay = 1000, logger, label } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const delay = baseDelay * 2 ** attempt;
        logger && logger.warn(
          `${label ? label + ' ' : ''}失败(${err.message})，${delay}ms 后重试 (${attempt + 1}/${retries})`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

module.exports = { mapLimit, withRetry };
