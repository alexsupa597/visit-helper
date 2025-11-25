module.exports = {
  apps: [
    {
      name: 'visit-helper',
      script: './visit.js',
      exec_mode: 'fork',
      instances: 1,
      // 使用服务器本地时间的 10:00，每天执行一次；可按需修改 cron 表达式
      cron_restart: '0 10 * * *',
      // 脚本是一次性任务，正常结束后不要立即重启，只在 cron 时间点重启
      autorestart: false,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};


