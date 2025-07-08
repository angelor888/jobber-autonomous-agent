const express = require('express');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { validateWebhook } = require('../middleware/webhookValidator');
const EventEmitter = require('events');

class WebhookServer extends EventEmitter {
  constructor(agent) {
    super();
    this.agent = agent;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.webhookQueue = [];
    this.processing = false;
    this.stats = {
      received: 0,
      processed: 0,
      failed: 0,
      byUser: new Map(),
      byTopic: new Map()
    };
  }

  setupMiddleware() {
    // Raw body for webhook signature validation
    this.app.use('/webhooks', express.raw({ type: 'application/json' }));
    
    // JSON parsing for other routes
    this.app.use(express.json());
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} from ${req.ip}`);
      next();
    });
    
    // CORS for API access
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      next();
    });
  }

  setupRoutes() {
    // Main webhook endpoint - receives webhooks for ALL users
    this.app.post('/webhooks/jobber', validateWebhook, async (req, res) => {
      try {
        const event = JSON.parse(req.body);
        
        // Immediately respond to Jobber
        res.status(200).json({ received: true });
        
        // Process asynchronously
        this.queueWebhook(event);
      } catch (error) {
        logger.error('Webhook processing error:', error);
        res.status(500).json({ error: 'Processing failed' });
      }
    });

    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      const health = await this.getHealthStatus();
      res.status(health.status === 'healthy' ? 200 : 503).json(health);
    });

    // Status endpoint
    this.app.get('/status', (req, res) => {
      res.json({
        uptime: process.uptime(),
        stats: this.getStats(),
        queueLength: this.webhookQueue.length,
        processing: this.processing,
        multiUserEnabled: true, // Always true - this is the fix!
        version: '2.0.0'
      });
    });

    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      res.json({
        webhooks: this.stats,
        performance: this.agent.getPerformanceMetrics(),
        queue: {
          length: this.webhookQueue.length,
          processing: this.processing
        }
      });
    });

    // Manual webhook test endpoint
    this.app.post('/test/webhook', (req, res) => {
      const testEvent = {
        data: {
          webHookEvent: {
            topic: 'JOB_CREATE',
            appId: 'test-app',
            accountId: 'test-account',
            itemId: 'test-job-' + Date.now(),
            occurredAt: new Date().toISOString(),
            userId: req.body.userId || 'test-user',
            userName: req.body.userName || 'Test User'
          }
        }
      };
      
      this.queueWebhook(testEvent);
      res.json({ 
        message: 'Test webhook queued',
        event: testEvent
      });
    });

    // Agent control endpoints
    this.app.post('/agent/pause', (req, res) => {
      this.agent.pause();
      res.json({ status: 'paused' });
    });

    this.app.post('/agent/resume', (req, res) => {
      this.agent.resume();
      res.json({ status: 'resumed' });
    });

    this.app.get('/agent/config', (req, res) => {
      res.json(this.agent.getConfig());
    });

    // OAuth callback for Jobber
    this.app.get('/auth/callback', async (req, res) => {
      const { code } = req.query;
      
      if (!code) {
        return res.status(400).send('Authorization code missing');
      }
      
      try {
        // Exchange code for token
        await this.agent.handleOAuthCallback(code);
        res.send('Authorization successful! You can close this window.');
      } catch (error) {
        logger.error('OAuth callback error:', error);
        res.status(500).send('Authorization failed');
      }
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      logger.error('Express error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  queueWebhook(event) {
    // Extract webhook data
    const webhookEvent = event.data?.webHookEvent || event;
    
    // Track stats by user - this is key for multi-user support!
    const userId = webhookEvent.userId || 'unknown';
    const userName = webhookEvent.userName || 'Unknown User';
    
    this.stats.received++;
    this.stats.byUser.set(userId, (this.stats.byUser.get(userId) || 0) + 1);
    this.stats.byTopic.set(webhookEvent.topic, (this.stats.byTopic.get(webhookEvent.topic) || 0) + 1);
    
    logger.info(`Webhook received from user ${userName} (${userId}): ${webhookEvent.topic}`);
    
    // Add to queue with metadata
    this.webhookQueue.push({
      id: `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      event: webhookEvent,
      receivedAt: new Date(),
      userId,
      userName
    });
    
    // Emit event for monitoring
    this.emit('webhookReceived', {
      topic: webhookEvent.topic,
      userId,
      userName,
      queueLength: this.webhookQueue.length
    });
    
    // Process queue if not already processing
    if (!this.processing) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.processing || this.webhookQueue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.webhookQueue.length > 0) {
      const webhook = this.webhookQueue.shift();
      
      try {
        logger.info(`Processing webhook ${webhook.id} from user ${webhook.userName}`);
        
        // Process through agent
        await this.agent.processWebhook(webhook.event, {
          userId: webhook.userId,
          userName: webhook.userName,
          receivedAt: webhook.receivedAt
        });
        
        this.stats.processed++;
        
        this.emit('webhookProcessed', {
          id: webhook.id,
          topic: webhook.event.topic,
          userId: webhook.userId,
          success: true
        });
      } catch (error) {
        logger.error(`Failed to process webhook ${webhook.id}:`, error);
        this.stats.failed++;
        
        this.emit('webhookFailed', {
          id: webhook.id,
          topic: webhook.event.topic,
          userId: webhook.userId,
          error: error.message
        });
        
        // Implement retry logic
        if (webhook.retries < 3) {
          webhook.retries = (webhook.retries || 0) + 1;
          webhook.nextRetry = new Date(Date.now() + Math.pow(2, webhook.retries) * 1000);
          this.webhookQueue.push(webhook);
        }
      }
      
      // Rate limiting - prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.processing = false;
  }

  async getHealthStatus() {
    const checks = {
      server: 'healthy',
      queue: this.webhookQueue.length < 100 ? 'healthy' : 'degraded',
      processing: this.processing ? 'busy' : 'idle',
      agent: this.agent.isHealthy() ? 'healthy' : 'unhealthy',
      multiUser: 'enabled' // Always enabled!
    };
    
    // Check Jobber API connection
    try {
      const apiHealth = await this.agent.checkAPIHealth();
      checks.jobberAPI = apiHealth.status;
    } catch (error) {
      checks.jobberAPI = 'unhealthy';
    }
    
    const overallStatus = Object.values(checks).every(status => 
      status === 'healthy' || status === 'idle' || status === 'enabled'
    ) ? 'healthy' : 'degraded';
    
    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks
    };
  }

  getStats() {
    const userStats = {};
    for (const [userId, count] of this.stats.byUser) {
      userStats[userId] = count;
    }
    
    const topicStats = {};
    for (const [topic, count] of this.stats.byTopic) {
      topicStats[topic] = count;
    }
    
    return {
      total: {
        received: this.stats.received,
        processed: this.stats.processed,
        failed: this.stats.failed,
        successRate: this.stats.received > 0 ? 
          ((this.stats.processed / this.stats.received) * 100).toFixed(2) + '%' : '0%'
      },
      byUser: userStats,
      byTopic: topicStats,
      uniqueUsers: this.stats.byUser.size, // This shows multi-user is working!
      mostActiveUser: this.getMostActiveUser()
    };
  }

  getMostActiveUser() {
    let maxCount = 0;
    let mostActive = null;
    
    for (const [userId, count] of this.stats.byUser) {
      if (count > maxCount) {
        maxCount = count;
        mostActive = userId;
      }
    }
    
    return mostActive;
  }

  start(port = process.env.PORT || 3000) {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, (err) => {
        if (err) {
          logger.error('Failed to start webhook server:', err);
          reject(err);
        } else {
          logger.info(`Webhook server listening on port ${port}`);
          logger.info('Multi-user webhook processing ENABLED');
          logger.info('Ready to receive webhooks from ALL Jobber users');
          resolve(port);
        }
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Webhook server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Graceful shutdown
  async shutdown() {
    logger.info('Shutting down webhook server...');
    
    // Stop accepting new webhooks
    await this.stop();
    
    // Process remaining queue
    while (this.webhookQueue.length > 0 && this.processing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    logger.info('Webhook server shutdown complete');
  }
}

module.exports = WebhookServer;