module.exports = {
  apps: [{
    name: 'jobber-agent',
    script: './src/index.js',
    instances: process.env.INSTANCES || 1,
    exec_mode: 'cluster',
    
    // Environment variables
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3000
    },
    
    // Restart policies
    max_memory_restart: '500M',
    restart_delay: 4000,
    autorestart: true,
    
    // Logging
    log_file: './logs/combined.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Advanced features
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'data', '.git'],
    
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Monitoring
    instance_var: 'INSTANCE_ID',
    
    // Error handling
    min_uptime: '10s',
    max_restarts: 10,
    
    // Multi-user webhook feature flag
    env_all: {
      MULTI_USER_ENABLED: true,
      AUTONOMOUS_MODE: true
    }
  }],
  
  deploy: {
    production: {
      user: 'deploy',
      host: process.env.DEPLOY_HOST,
      ref: 'origin/main',
      repo: 'https://github.com/duetright/jobber-autonomous-agent.git',
      path: '/var/www/jobber-agent',
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': 'echo "Deploying Jobber Autonomous Agent..."',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};