// 设置云函数安全规则：登录用户（含匿名登录）可调用
const fs = require('fs')
const path = require('path')
const os = require('os')
const { tcb: tencentcloud } = require('../cloudfunctions/pgsetup/node_modules/tencentcloud-sdk-nodejs-tcb')

const ENV_ID = 'profitable-newt-d2fl5wq6f366cf13'
const cred = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/.cloudbase/auth.json'), 'utf8')).credential

const client = new tencentcloud.v20180608.Client({
  credential: {
    secretId: cred.tmpSecretId,
    secretKey: cred.tmpSecretKey,
    token: cred.tmpToken
  },
  region: 'ap-shanghai',
  profile: { httpProfile: { endpoint: 'tcb.tencentcloudapi.com' } }
})

async function main() {
  // 1. 查当前配置
  try {
    const cur = await client.DescribeResourcePermission({ EnvId: ENV_ID, ResourceType: 'function' })
    console.log('当前 function 权限配置:', JSON.stringify(cur, null, 2))
  } catch (e) {
    console.log('查询当前配置失败:', e.message)
  }

  // 2. 设置：环境级（Resource 不传），登录用户（含匿名）可调用
  const rule = JSON.stringify({ '*': { invoke: 'auth != null' } })
  const res = await client.ModifyResourcePermission({
    EnvId: ENV_ID,
    ResourceType: 'function',
    Permission: 'CUSTOM',
    SecurityRule: rule
  })
  console.log('设置结果:', JSON.stringify(res, null, 2))

  // 3. 复查
  const after = await client.DescribeResourcePermission({ EnvId: ENV_ID, ResourceType: 'function' })
  console.log('设置后配置:', JSON.stringify(after, null, 2))
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1) })
