// 开发用检查脚本：扫描所有 src/**/*.js，找出使用了 SF.util 函数但未解构的文件
const fs = require('fs');
const path = require('path');
const utilNames = ['TAU', 'clamp', 'lerp', 'dist2', 'angleTo', 'rand', 'chance', 'hexToRgb', 'hashString'];
const root = path.join(__dirname, '..', 'src');
const files = [];
for (const d of fs.readdirSync(root)) {
  const dp = path.join(root, d);
  if (!fs.statSync(dp).isDirectory()) continue;
  for (const f of fs.readdirSync(dp)) if (f.endsWith('.js')) files.push(path.join(dp, f));
}
let bad = 0;
for (const f of files) {
  // utils.js 是 SF.util 的定义模块，函数名以声明形式出现属于误报，跳过
  if (path.basename(f) === 'utils.js') continue;
  const src = fs.readFileSync(f, 'utf8');
  const m = src.match(/const\s*\{([^}]+)\}\s*=\s*SF\.util/);
  const have = new Set(m ? m[1].split(',').map(s => s.trim().split(':')[0].trim()) : []);
  for (const n of utilNames) {
    if (have.has(n)) continue;
    const use = new RegExp('[^\\w.]' + n + '\\s*\\(');
    if (use.test(src)) { console.log('MISSING', path.relative(root, f), '→', n); bad++; }
  }
}
console.log(bad === 0 ? '无缺失解构' : bad + ' 处缺失');
process.exitCode = bad ? 1 : 0;
