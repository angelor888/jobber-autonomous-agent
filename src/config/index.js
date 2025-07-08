const path = require('path');
const logger = require('../utils/logger');

class Config {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.isDevelopment = this.env === 'development';
    this.isProduction = this.env === 'production';
    this.isTest = this.env === 'test';
    
    // Load and validate configuration
    this.config = this.loadConfig();
    this.validateConfig();
  }

  loadConfig() {
    return {
      // Server Configuration
      server: {
        port: parseInt(process.env.PORT || '3000', 10),
        host: process.env.HOST || '0.0.0.0',
        baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || '3000'}`,
        trustProxy: process.env.TRUST_PROXY === 'true'
      },

      // Jobber Configuration
      jobber: {
        clientId: process.env.JOBBER_CLIENT_ID,
        clientSecret: process.env.JOBBER_CLIENT_SECRET,
        redirectUri: process.env.JOBBER_REDIRECT_URI,
        apiBaseUrl: process.env.JOBBER_API_URL || 'https://api.getjobber.com/api',
        graphqlUrl: process.env.JOBBER_GRAPHQL_URL || 'https://api.getjobber.com/api/graphql',
        webhookPath: '/webhooks/jobber',
        scopes: [
          'clients:read',
          'clients:write',
          'jobs:read',
          'jobs:write',
          'quotes:read',
          'quotes:write',
          'invoices:read',
          'invoices:write',
          'users:read',
          'schedule:read'
        ]
      },

      // Agent Configuration
      agent: {
        name: process.env.AGENT_NAME || 'Jobber Autonomous Agent',
        version: process.env.npm_package_version || '2.0.0',
        autonomousMode: process.env.AUTONOMOUS_MODE !== 'false',
        learningEnabled: process.env.LEARNING_ENABLED === 'true',
        confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.75'),
        maxDecisionTime: parseInt(process.env.MAX_DECISION_TIME || '5000', 10),
        multiUserEnabled: true // ALWAYS TRUE - This is the key feature!
      },

      // Notifications
      notifications: {
        slack: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_CHANNEL || '#jobber-agent',
          username: process.env.SLACK_USERNAME || 'Jobber Agent',
          iconEmoji: process.env.SLACK_ICON || ':robot_face:'
        },
        email: {
          enabled: process.env.EMAIL_ENABLED === 'true',
          from: process.env.EMAIL_FROM,
          smtpHost: process.env.SMTP_HOST,
          smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
          smtpUser: process.env.SMTP_USER,
          smtpPass: process.env.SMTP_PASS
        }
      },

      // Rate Limiting
      rateLimit: {
        webhooksPerMinute: parseInt(process.env.WEBHOOKS_PER_MINUTE || '60', 10),
        apiRequestsPerMinute: parseInt(process.env.API_REQUESTS_PER_MINUTE || '120', 10),
        burstAllowance: parseInt(process.env.BURST_ALLOWANCE || '10', 10)
      },

      // Security
      security: {
        webhookSecret: process.env.JOBBER_CLIENT_SECRET, // Used for HMAC validation
        jwtSecret: process.env.JWT_SECRET || this.generateDefaultSecret(),
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
        corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
        trustedIps: process.env.TRUSTED_IPS?.split(',') || []
      },

      // Logging
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'json',
        directory: process.env.LOG_DIR || path.join(__dirname, '../../logs'),
        maxFileSize: process.env.LOG_MAX_SIZE || '10m',
        maxFiles: parseInt(process.env.LOG_MAX_FILES || '7', 10),
        errorFile: 'error.log',
        combinedFile: 'combined.log'
      },

      // Queue Configuration
      queue: {
        maxSize: parseInt(process.env.QUEUE_MAX_SIZE || '1000', 10),
        processingDelay: parseInt(process.env.QUEUE_DELAY || '100', 10),
        retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3', 10),
        retryDelay: parseInt(process.env.RETRY_DELAY || '1000', 10)
      },

      // Performance
      performance: {
        maxConcurrentWebhooks: parseInt(process.env.MAX_CONCURRENT || '10', 10),
        requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10),
        keepAliveTimeout: parseInt(process.env.KEEP_ALIVE_TIMEOUT || '65000', 10)
      },

      // Features
      features: {
        autoAssignment: process.env.FEATURE_AUTO_ASSIGNMENT !== 'false',
        emergencyDetection: process.env.FEATURE_EMERGENCY !== 'false',
        vipHandling: process.env.FEATURE_VIP !== 'false',
        capacityManagement: process.env.FEATURE_CAPACITY !== 'false',
        qualityControl: process.env.FEATURE_QUALITY !== 'false',
        predictiveScheduling: process.env.FEATURE_PREDICTIVE === 'true'
      },

      // Database (optional)
      database: {
        enabled: process.env.DATABASE_URL ? true : false,
        url: process.env.DATABASE_URL,
        poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10)
      },

      // Redis (optional)
      redis: {
        enabled: process.env.REDIS_URL ? true : false,
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        keyPrefix: process.env.REDIS_PREFIX || 'jobber-agent:'
      },

      // Monitoring
      monitoring: {
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
        metricsEnabled: process.env.METRICS_ENABLED === 'true',
        metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10)
      }
    };
  }

  validateConfig() {
    const required = [
      'jobber.clientId',
      'jobber.clientSecret',
      'jobber.redirectUri'
    ];

    const missing = [];

    for (const path of required) {
      const value = this.getNestedValue(this.config, path);
      if (!value) {
        missing.push(path);
      }
    }

    if (missing.length > 0) {
      const errorMsg = `Missing required configuration: ${missing.join(', ')}`;
      logger.error(errorMsg);
      
      if (this.isProduction) {
        throw new Error(errorMsg);
      } else {
        logger.warn('Running in development mode with missing configuration');
      }
    }

    // Validate multi-user is enabled
    if (!this.config.agent.multiUserEnabled) {
      throw new Error('Multi-user support must be enabled!');
    }

    logger.info('Configuration validated successfully');
    logger.info(`Multi-user support: ${this.config.agent.multiUserEnabled ? 'ENABLED' : 'DISABLED'}`);
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  generateDefaultSecret() {
    if (this.isDevelopment) {
      return 'development-secret-do-not-use-in-production';
    }
    throw new Error('JWT_SECRET must be provided in production');
  }

  get(path) {
    return this.getNestedValue(this.config, path);
  }

  getAll() {
    return this.config;
  }

  isDevelopment() {
    return this.isDevelopment;
  }

  isProduction() {
    return this.isProduction;
  }

  // Helper methods for common configurations
  getServerUrl() {
    return this.config.server.baseUrl;
  }

  getWebhookUrl() {
    return `${this.config.server.baseUrl}${this.config.jobber.webhookPath}`;
  }

  getRedirectUrl() {
    return this.config.jobber.redirectUri;
  }

  isMultiUserEnabled() {
    return this.config.agent.multiUserEnabled;
  }

  isAutonomousMode() {
    return this.config.agent.autonomousMode;
  }

  isLearningEnabled() {
    return this.config.agent.learningEnabled;
  }

  // Feature flags
  isFeatureEnabled(feature) {
    return this.config.features[feature] === true;
  }

  // Export configuration for monitoring
  exportSafeConfig() {
    const safeConfig = JSON.parse(JSON.stringify(this.config));
    
    // Remove sensitive values
    delete safeConfig.jobber.clientSecret;
    delete safeConfig.security.webhookSecret;
    delete safeConfig.security.jwtSecret;
    delete safeConfig.notifications.email.smtpPass;
    delete safeConfig.database.url;
    delete safeConfig.redis.url;
    
    return safeConfig;
  }
}

// Export singleton instance
module.exports = new Config();