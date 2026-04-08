/**
 * PM2 Ecosystem — 한울영성개발원 홈페이지
 * 작성: 아론(dev-2) | 2026-04-08
 *
 * 사용:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'hanwool-main',
      script: 'app/server.js',
      cwd: 'G:/WorkSpace/HomePage/Hanwool',
      node_args: '--experimental-vm-modules',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
      },
      // 재시작 정책
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 3000,
      // 로그
      out_file: 'G:/WorkSpace/HomePage/Hanwool/logs/main-out.log',
      error_file: 'G:/WorkSpace/HomePage/Hanwool/logs/main-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss KST',
    },
    {
      name: 'hanul-editor',
      script: 'app/server-editor-v2.js',
      cwd: 'G:/WorkSpace/HomePage/Hanwool',
      node_args: '--experimental-vm-modules',
      env: {
        NODE_ENV: 'production',
        PORT: 8081,
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      restart_delay: 3000,
      out_file: 'G:/WorkSpace/HomePage/Hanwool/logs/editor-out.log',
      error_file: 'G:/WorkSpace/HomePage/Hanwool/logs/editor-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss KST',
    },
  ],
};
