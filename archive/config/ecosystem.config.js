// Archived duplicate PM2 ecosystem config (canonical is ecosystem.config.cjs)
// This copy is retained for reference only and is not used by ops/pm2_start.sh.
// If you need to restore, move back to project root as ecosystem.config.js.
module.exports = {
  apps: [
    {
      name: 'rektrace',
      script: 'dist/rektrace-rugscan/rektrace-rugscan/src/index.js',
      exec_mode: 'cluster',
      instances: 2,
      max_memory_restart: '500M',
      autorestart: true,
      watch: false,
      node_args: '--enable-source-maps',
      env: {
        NODE_ENV: 'production',
        // Other env is sourced from .env.prod via deploy script/pm2 --update-env
      },
      merge_logs: true,
      time: true,
      kill_timeout: 8000,
      exp_backoff_restart_delay: 200,
      out_file: 'logs/rektrace-out.log',
      error_file: 'logs/rektrace-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
    },
  ],
};


