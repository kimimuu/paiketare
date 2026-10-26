// 联通性验证云函数
exports.main = async (event) => {
  return {
    code: 0,
    data: {
      message: 'CloudBase 连接成功',
      echo: event,
      time: new Date().toISOString()
    }
  }
}
