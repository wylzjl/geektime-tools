'use strict';

/**
 * 轻量日志器。
 * - info 默认写 stdout；--json 模式下改写到 stderr，保证 stdout 只输出机器可读 JSON
 * - debug 需要 --verbose
 * - warn/error 永远写 stderr
 */
function createLogger({ quiet = false, verbose = false, json = false } = {}) {
  return {
    info: (...args) => {
      if (quiet) return;
      const stream = json ? process.stderr : process.stdout;
      stream.write(args.join(' ') + '\n');
    },
    debug: (...args) => {
      if (!verbose || quiet) return;
      process.stderr.write('[debug] ' + args.join(' ') + '\n');
    },
    warn: (...args) => process.stderr.write('⚠️  ' + args.join(' ') + '\n'),
    error: (...args) => process.stderr.write('❌  ' + args.join(' ') + '\n'),
  };
}

module.exports = { createLogger };
