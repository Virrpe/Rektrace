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
        HEALTH_PORT: '8081',
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


