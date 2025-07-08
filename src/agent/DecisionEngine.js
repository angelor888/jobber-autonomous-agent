const logger = require('../utils/logger');
const jobberAPI = require('../api/JobberAPI');
const EventEmitter = require('events');

class DecisionEngine extends EventEmitter {
  constructor() {
    super();
    this.rules = this.loadRules();
    this.learningData = new Map();
    this.confidenceThreshold = 0.75;
    this.decisionHistory = [];
    this.maxHistorySize = 1000;
  }

  loadRules() {
    // Business rules that apply to ALL users
    return {
      emergencyResponse: {
        priority: 100,
        conditions: {
          keywords: ['emergency', 'urgent', 'leak', 'flood', 'fire', 'electrical hazard'],
          timeWindow: 4 // hours
        },
        actions: ['notifyOnCall', 'assignNearestTech', 'sendEmergencyAlert']
      },
      
      vipClientHandler: {
        priority: 90,
        conditions: {
          clientValue: 50000, // lifetime value
          responseTime: 2 // hours
        },
        actions: ['assignBestTech', 'notifyManager', 'enablePriorityTracking']
      },
      
      weekendPremium: {
        priority: 80,
        conditions: {
          dayOfWeek: [0, 6], // Sunday, Saturday
          multiplier: 1.5
        },
        actions: ['applyWeekendRate', 'confirmAvailability']
      },
      
      newClientOnboarding: {
        priority: 70,
        conditions: {
          isNewClient: true,
          daysSinceCreation: 0
        },
        actions: ['sendWelcomeMessage', 'assignAccountManager', 'scheduleFollowUp']
      },
      
      capacityManagement: {
        priority: 60,
        conditions: {
          dailyCapacityThreshold: 0.85,
          weeklyCapacityThreshold: 0.90
        },
        actions: ['warnCapacity', 'suggestRescheduling', 'notifyScheduler']
      },
      
      autoAssignment: {
        priority: 50,
        conditions: {
          unassignedDuration: 30, // minutes
          hasAvailableTech: true
        },
        actions: ['autoAssignTech', 'notifyAssignment']
      },
      
      qualityControl: {
        priority: 40,
        conditions: {
          jobType: ['bathroom', 'kitchen'],
          requiresInspection: true
        },
        actions: ['scheduleInspection', 'createChecklist']
      }
    };
  }

  async analyze(event, context = {}) {
    const startTime = Date.now();
    logger.info(`Analyzing event: ${event.topic} for item ${event.itemId}`);

    try {
      // Fetch full data from Jobber
      const fullData = await this.enrichEventData(event);
      
      // Extract features for decision making
      const features = this.extractFeatures(fullData, context);
      
      // Apply rules and get decisions
      const decisions = await this.applyRules(features, fullData);
      
      // Calculate confidence
      const confidence = this.calculateConfidence(decisions, features);
      
      // Learn from this decision
      if (process.env.LEARNING_ENABLED === 'true') {
        this.recordDecision(event, decisions, confidence);
      }
      
      const analysisTime = Date.now() - startTime;
      logger.info(`Analysis completed in ${analysisTime}ms with confidence ${confidence}`);
      
      return {
        event,
        features,
        decisions,
        confidence,
        analysisTime,
        shouldExecute: confidence >= this.confidenceThreshold
      };
    } catch (error) {
      logger.error('Decision analysis failed:', error);
      return {
        event,
        error: error.message,
        decisions: [],
        confidence: 0,
        shouldExecute: false
      };
    }
  }

  async enrichEventData(event) {
    const { topic, itemId } = event;
    
    try {
      const data = await jobberAPI.processWebhookEvent(event);
      
      // Add user information for multi-user context
      if (data && topic.startsWith('JOB_')) {
        const users = await jobberAPI.getUsers();
        data.allUsers = users;
        data.createdByUser = users.find(u => u.id === event.userId);
      }
      
      return data;
    } catch (error) {
      logger.error('Failed to enrich event data:', error);
      throw error;
    }
  }

  extractFeatures(data, context) {
    const features = {
      // Temporal features
      timeOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      isWeekend: [0, 6].includes(new Date().getDay()),
      isAfterHours: new Date().getHours() < 8 || new Date().getHours() >= 17,
      
      // Job features (if applicable)
      jobTitle: data?.title?.toLowerCase() || '',
      jobDescription: data?.description?.toLowerCase() || '',
      jobStatus: data?.status || '',
      jobValue: data?.total || 0,
      hasEmergencyKeywords: false,
      
      // Client features
      clientName: data?.client?.name || '',
      clientEmail: data?.client?.email || '',
      isNewClient: false,
      clientLifetimeValue: 0,
      
      // User features (multi-user support)
      createdByUserId: data?.createdByUser?.id || context.userId,
      createdByUserName: data?.createdByUser?.name || 'Unknown',
      createdByUserRole: data?.createdByUser?.role || 'Unknown',
      
      // Assignment features
      isAssigned: !!data?.assignedTo?.id,
      assignedToId: data?.assignedTo?.id || null,
      assignedToName: data?.assignedTo?.name || '',
      
      // Location features
      propertyAddress: data?.property?.address || {},
      city: data?.property?.address?.city || '',
      
      // System features
      currentCapacity: context.currentCapacity || 0,
      availableTechs: context.availableTechs || []
    };

    // Check for emergency keywords
    const emergencyKeywords = this.rules.emergencyResponse.conditions.keywords;
    features.hasEmergencyKeywords = emergencyKeywords.some(keyword => 
      features.jobTitle.includes(keyword) || features.jobDescription.includes(keyword)
    );

    // Calculate client value (would need historical data in production)
    if (data?.client) {
      features.clientLifetimeValue = data.client.totalRevenue || 0;
      features.isNewClient = data.client.jobCount <= 1;
    }

    return features;
  }

  async applyRules(features, fullData) {
    const decisions = [];
    
    for (const [ruleName, rule] of Object.entries(this.rules)) {
      const applies = await this.evaluateRule(rule, features, fullData);
      
      if (applies) {
        decisions.push({
          rule: ruleName,
          priority: rule.priority,
          actions: rule.actions,
          reasoning: this.generateReasoning(ruleName, features)
        });
      }
    }

    // Sort by priority
    decisions.sort((a, b) => b.priority - a.priority);
    
    return decisions;
  }

  async evaluateRule(rule, features, fullData) {
    const { conditions } = rule;
    
    // Emergency response
    if (conditions.keywords && features.hasEmergencyKeywords) {
      return true;
    }
    
    // VIP client
    if (conditions.clientValue && features.clientLifetimeValue >= conditions.clientValue) {
      return true;
    }
    
    // Weekend premium
    if (conditions.dayOfWeek && conditions.dayOfWeek.includes(features.dayOfWeek)) {
      return true;
    }
    
    // New client
    if (conditions.isNewClient && features.isNewClient) {
      return true;
    }
    
    // Capacity management
    if (conditions.dailyCapacityThreshold && features.currentCapacity >= conditions.dailyCapacityThreshold) {
      return true;
    }
    
    // Auto assignment
    if (conditions.unassignedDuration && !features.isAssigned && features.availableTechs.length > 0) {
      return true;
    }
    
    return false;
  }

  generateReasoning(ruleName, features) {
    const reasoningMap = {
      emergencyResponse: `Emergency detected in job "${features.jobTitle}". Immediate response required.`,
      vipClientHandler: `VIP client ${features.clientName} (LTV: $${features.clientLifetimeValue}). Premium service activated.`,
      weekendPremium: `Weekend job detected. Premium rates will apply.`,
      newClientOnboarding: `New client ${features.clientName} detected. Initiating onboarding sequence.`,
      capacityManagement: `Capacity at ${(features.currentCapacity * 100).toFixed(0)}%. Management intervention needed.`,
      autoAssignment: `Unassigned job detected. Auto-assigning to available technician.`,
      qualityControl: `Quality control required for ${features.jobTitle}. Scheduling inspection.`
    };
    
    return reasoningMap[ruleName] || `Rule ${ruleName} triggered based on conditions.`;
  }

  calculateConfidence(decisions, features) {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence based on data completeness
    if (features.jobTitle) confidence += 0.1;
    if (features.clientName) confidence += 0.1;
    if (features.createdByUserId) confidence += 0.1;
    
    // Increase confidence based on rule matches
    if (decisions.length > 0) {
      confidence += Math.min(0.2, decisions.length * 0.05);
    }
    
    // Check historical success for similar decisions
    const historicalSuccess = this.checkHistoricalSuccess(decisions, features);
    confidence = confidence * 0.7 + historicalSuccess * 0.3;
    
    return Math.min(1, confidence);
  }

  checkHistoricalSuccess(decisions, features) {
    // Look for similar past decisions
    const similarDecisions = this.decisionHistory.filter(history => {
      return history.features.jobStatus === features.jobStatus &&
             history.features.isWeekend === features.isWeekend &&
             history.decisions.some(d => decisions.some(curr => curr.rule === d.rule));
    });
    
    if (similarDecisions.length === 0) return 0.75; // Default success rate
    
    const successCount = similarDecisions.filter(h => h.outcome === 'success').length;
    return successCount / similarDecisions.length;
  }

  recordDecision(event, decisions, confidence) {
    const record = {
      timestamp: new Date(),
      event,
      decisions,
      confidence,
      features: event.features || {},
      outcome: 'pending' // Will be updated based on feedback
    };
    
    this.decisionHistory.push(record);
    
    // Keep history size manageable
    if (this.decisionHistory.length > this.maxHistorySize) {
      this.decisionHistory.shift();
    }
    
    // Emit for monitoring
    this.emit('decisionRecorded', record);
  }

  async executeDecisions(decisions, context) {
    const results = [];
    
    for (const decision of decisions) {
      logger.info(`Executing decision: ${decision.rule} with actions: ${decision.actions.join(', ')}`);
      
      for (const action of decision.actions) {
        try {
          const result = await this.executeAction(action, context, decision);
          results.push({
            action,
            success: true,
            result
          });
        } catch (error) {
          logger.error(`Failed to execute action ${action}:`, error);
          results.push({
            action,
            success: false,
            error: error.message
          });
        }
      }
    }
    
    return results;
  }

  async executeAction(action, context, decision) {
    // Map actions to actual implementations
    const actionMap = {
      notifyOnCall: () => this.notifyOnCall(context),
      assignNearestTech: () => this.assignNearestTech(context),
      sendEmergencyAlert: () => this.sendEmergencyAlert(context),
      assignBestTech: () => this.assignBestTech(context),
      notifyManager: () => this.notifyManager(context, decision),
      enablePriorityTracking: () => this.enablePriorityTracking(context),
      applyWeekendRate: () => this.applyWeekendRate(context),
      confirmAvailability: () => this.confirmAvailability(context),
      sendWelcomeMessage: () => this.sendWelcomeMessage(context),
      assignAccountManager: () => this.assignAccountManager(context),
      scheduleFollowUp: () => this.scheduleFollowUp(context),
      warnCapacity: () => this.warnCapacity(context),
      suggestRescheduling: () => this.suggestRescheduling(context),
      notifyScheduler: () => this.notifyScheduler(context),
      autoAssignTech: () => this.autoAssignTech(context),
      notifyAssignment: () => this.notifyAssignment(context),
      scheduleInspection: () => this.scheduleInspection(context),
      createChecklist: () => this.createChecklist(context)
    };
    
    const actionFunction = actionMap[action];
    if (!actionFunction) {
      throw new Error(`Unknown action: ${action}`);
    }
    
    return await actionFunction();
  }

  // Action implementations (these would integrate with various services)
  async notifyOnCall(context) {
    logger.info('Notifying on-call personnel...');
    // Implementation would send alerts via Slack, SMS, etc.
    return { notified: true, method: 'slack' };
  }

  async assignNearestTech(context) {
    logger.info('Finding nearest available technician...');
    // Implementation would use location data and availability
    return { assigned: true, techId: 'tech-123' };
  }

  async sendEmergencyAlert(context) {
    logger.info('Sending emergency alert to all channels...');
    // Implementation would broadcast to multiple channels
    return { alerted: true, channels: ['slack', 'sms', 'email'] };
  }

  async assignBestTech(context) {
    logger.info('Assigning best available technician for VIP client...');
    // Implementation would consider ratings, experience, etc.
    return { assigned: true, techId: 'tech-vip-456' };
  }

  async notifyManager(context, decision) {
    logger.info(`Notifying manager about ${decision.rule}...`);
    // Implementation would send detailed notification to managers
    return { notified: true, managerId: 'mgr-789' };
  }

  async enablePriorityTracking(context) {
    logger.info('Enabling priority tracking for job...');
    // Implementation would set up special monitoring
    return { enabled: true, trackingId: 'track-101' };
  }

  async applyWeekendRate(context) {
    logger.info('Applying weekend premium rates...');
    // Implementation would update pricing
    return { applied: true, multiplier: 1.5 };
  }

  async confirmAvailability(context) {
    logger.info('Confirming technician availability for weekend...');
    // Implementation would check and confirm
    return { confirmed: true };
  }

  async sendWelcomeMessage(context) {
    logger.info('Sending welcome message to new client...');
    // Implementation would send personalized welcome
    return { sent: true, messageId: 'msg-202' };
  }

  async assignAccountManager(context) {
    logger.info('Assigning account manager to new client...');
    // Implementation would assign based on workload
    return { assigned: true, managerId: 'am-303' };
  }

  async scheduleFollowUp(context) {
    logger.info('Scheduling follow-up for new client...');
    // Implementation would create follow-up tasks
    return { scheduled: true, date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
  }

  async warnCapacity(context) {
    logger.info('Warning about capacity limits...');
    // Implementation would send capacity alerts
    return { warned: true, currentCapacity: context.currentCapacity };
  }

  async suggestRescheduling(context) {
    logger.info('Suggesting rescheduling options...');
    // Implementation would analyze and suggest alternatives
    return { suggested: true, alternatives: 3 };
  }

  async notifyScheduler(context) {
    logger.info('Notifying scheduling team...');
    // Implementation would alert scheduling team
    return { notified: true };
  }

  async autoAssignTech(context) {
    logger.info('Auto-assigning to available technician...');
    // Implementation would use smart assignment logic
    const availableTech = context.availableTechs[0];
    if (availableTech && context.jobId) {
      await jobberAPI.assignJob(context.jobId, availableTech.id);
      return { assigned: true, techId: availableTech.id };
    }
    return { assigned: false, reason: 'No available technicians' };
  }

  async notifyAssignment(context) {
    logger.info('Notifying about new assignment...');
    // Implementation would send notifications
    return { notified: true };
  }

  async scheduleInspection(context) {
    logger.info('Scheduling quality inspection...');
    // Implementation would create inspection job
    return { scheduled: true, inspectionDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) };
  }

  async createChecklist(context) {
    logger.info('Creating quality checklist...');
    // Implementation would generate job-specific checklist
    return { created: true, checklistId: 'check-404' };
  }

  // Learning and improvement methods
  updateOutcome(decisionId, outcome) {
    const decision = this.decisionHistory.find(d => d.id === decisionId);
    if (decision) {
      decision.outcome = outcome;
      this.emit('outcomeUpdated', { decisionId, outcome });
    }
  }

  getPerformanceMetrics() {
    const total = this.decisionHistory.length;
    const successful = this.decisionHistory.filter(d => d.outcome === 'success').length;
    const failed = this.decisionHistory.filter(d => d.outcome === 'failure').length;
    const pending = this.decisionHistory.filter(d => d.outcome === 'pending').length;
    
    return {
      total,
      successful,
      failed,
      pending,
      successRate: total > 0 ? successful / total : 0,
      averageConfidence: total > 0 ? 
        this.decisionHistory.reduce((sum, d) => sum + d.confidence, 0) / total : 0
    };
  }
}

module.exports = new DecisionEngine();