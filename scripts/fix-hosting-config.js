// 查询静态托管配置 + 关闭访问控制（needLogin）
const fs = require('fs')
const path = require('path')
const os = require('os')
const { tcb: tencentcloud } = require('../cloudfunctions/pgsetup/node_modules/tencentcloud-sdk-nodejs-tcb')

const ENV_ID = 'profitable-newt-d2fl5wq6f366cf13'
const cred = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/.cloudbase/auth.json'), 'utf8')).credential

const client = new tencentcloud.v20180608.Client({
  credential: { secretId: cred.tmpSecretId, secretKey: cred.tmpSecretKey, token: cred.tmpToken },
  region: 'ap-shanghai',
  profile: { httpProfile: { endpoint: 'tcb.tencentcloudapi.com' } }
})

async function main() {
  console.log('=== DescribeStaticStore ===')
  try {
    const r = await client.DescribeStaticStore({ EnvId: ENV_ID })
    console.log(JSON.stringify(r, null, 1).slice(0, 2500))
  } catch (e) {
    console.log('FAIL:', e.message)
  }

  console.log('\n=== DescribeLoginConfig ===')
  let cfg = null
  try {
    const r = await client.DescribeLoginConfig({ EnvId: ENV_ID })
    console.log(JSON.stringify(r, null, 1).slice(0, 2500))
    cfg = r
  } catch (e) {
    console.log('FAIL:', e.message)
  }

  if (process.argv.includes('--disable-access') && cfg) {
    console.log('\n=== ModifyLoginConfig: needLogin=false ===')
    try {
      const access = { ...(cfg.Access || cfg.access || {}) }
      access.NeedLogin = false
      access.needLogin = false
      const r = await client.ModifyLoginConfig({ EnvId: ENV_ID, Access: access })
      console.log('OK', JSON.stringify(r).slice(0, 800))
    } catch (e) {
      console.log('FAIL:', e.message)
    }
  }
}

main().catch(e => console.error('FATAL', e))
