'use strict';

const { loadCredentials } = require('../lib/config.cjs');
const { ensureSession } = require('../lib/session.cjs');
const { getCourses } = require('../lib/api.cjs');

/**
 * geektime courses [--size N] [--all] [--json]
 * 列出已购课程。
 */
async function run(options, logger) {
  const cred = loadCredentials({ configPath: options.config });
  const cookies = await ensureSession({
    phone: cred.phone,
    password: cred.password,
    cookiePath: options.cookies,
    logger,
  });
  const courses = await getCourses(cookies, { size: options.size, all: options.all, logger });

  if (options.json) {
    process.stdout.write(JSON.stringify(courses, null, 2) + '\n');
    return;
  }
  if (!courses.length) {
    logger.warn('没有找到已购课程');
    return;
  }
  logger.info(`📖 共 ${courses.length} 门已购课程:`);
  courses.forEach((course, index) => {
    const title = course.title || course.name || '未命名课程';
    const id = course.id || course.cid || 'N/A';
    logger.info(`  ${index + 1}. ${title} (ID: ${id})`);
  });
}

module.exports = { run };
