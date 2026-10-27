const { execSync } = require('child_process')
const msg = `feat(netlify): 从 CloudBase SDK 迁移到 Gateway REST + Netlify API 代理

【根因】
CloudBase Gateway 对跨域请求统一 403（OPTIONS 预检 + 带 Origin 的 POST）
原 CloudBase JS SDK 走同域 CloudBase 静态托管时没问题，换到 Netlify 后跨域失败

【改动】
- api/index.js: 从 @cloudbase/js-sdk 重写为 Gateway REST fetch，走 /api/* 相对路径
- TeacherTabbar.vue / AdminMenu.vue / Messages.vue: 去掉硬编码 Gateway URL，统一用 call()
- frontend/public/_redirects: 新增 Netlify API 代理规则（/api/* → CloudBase Gateway）
- netlify/edge-functions/api-proxy.js: Edge Function，剥离 Origin/Referer 头后转发

【Netlify 部署注意】
- 用 GitHub 连接 Netlify，Edge Function 才会自动部署
- Build command: cd frontend && npm install && npm run build
- Publish directory: frontend/dist`

execSync('/usr/bin/git add -A', { cwd: '/Users/kimiq/Desktop/排课', stdio: 'inherit' })
execSync(`/usr/bin/git commit -m ${JSON.stringify(msg)}`, { cwd: '/Users/kimiq/Desktop/排课', stdio: 'inherit' })
console.log('Done')
