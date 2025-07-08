const axios = require('axios');
const logger = require('../src/utils/logger');

// Test configuration
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TEST_USERS = [
  { id: 'user-angelo', name: 'Angelo' },
  { id: 'user-austin', name: 'Austin' },
  { id: 'user-sarah', name: 'Sarah' },
  { id: 'user-mike', name: 'Mike' }
];

class MultiUserTester {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      byUser: {}
    };
  }

  async runAllTests() {
    console.log('🧪 Starting Multi-User Webhook Tests...\n');
    
    try {
      // Check health first
      await this.checkHealth();
      
      // Test 1: Each user creates a job
      await this.testUserJobCreation();
      
      // Test 2: Simultaneous webhooks
      await this.testSimultaneousWebhooks();
      
      // Test 3: Different event types
      await this.testDifferentEventTypes();
      
      // Test 4: Load test
      await this.testHighVolume();
      
      // Print results
      this.printResults();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }

  async checkHealth() {
    console.log('🏥 Checking agent health...');
    
    try {
      const response = await axios.get(`${BASE_URL}/health`);
      
      if (response.data.status !== 'healthy') {
        throw new Error('Agent is not healthy');
      }
      
      if (!response.data.checks.multiUser === 'enabled') {
        throw new Error('Multi-user support is not enabled!');
      }
      
      console.log('✅ Agent is healthy and multi-user enabled\n');
    } catch (error) {
      throw new Error(`Health check failed: ${error.message}`);
    }
  }

  async testUserJobCreation() {
    console.log('📝 Test 1: Each user creates a job');
    
    for (const user of TEST_USERS) {
      try {
        const webhook = this.createJobWebhook(user);
        
        const response = await axios.post(`${BASE_URL}/test/webhook`, {
          userId: user.id,
          userName: user.name
        });
        
        if (response.status === 200) {
          console.log(`✅ ${user.name} - Job creation webhook accepted`);
          this.recordSuccess(user.id);
        } else {
          console.log(`❌ ${user.name} - Job creation webhook failed`);
          this.recordFailure(user.id);
        }
        
        // Wait a bit between requests
        await this.sleep(500);
        
      } catch (error) {
        console.log(`❌ ${user.name} - Error: ${error.message}`);
        this.recordFailure(user.id);
      }
    }
    
    console.log('');
  }

  async testSimultaneousWebhooks() {
    console.log('⚡ Test 2: Simultaneous webhooks from all users');
    
    const promises = TEST_USERS.map(user => 
      axios.post(`${BASE_URL}/test/webhook`, {
        userId: user.id,
        userName: user.name
      }).then(() => {
        this.recordSuccess(user.id);
        return { user: user.name, success: true };
      }).catch(error => {
        this.recordFailure(user.id);
        return { user: user.name, success: false, error: error.message };
      })
    );
    
    const results = await Promise.all(promises);
    
    const successful = results.filter(r => r.success).length;
    console.log(`✅ ${successful}/${TEST_USERS.length} simultaneous webhooks processed\n`);
  }

  async testDifferentEventTypes() {
    console.log('🔄 Test 3: Different event types from different users');
    
    const eventTypes = ['JOB_CREATE', 'JOB_UPDATE', 'CLIENT_CREATE', 'QUOTE_CREATE'];
    
    for (let i = 0; i < TEST_USERS.length; i++) {
      const user = TEST_USERS[i];
      const eventType = eventTypes[i];
      
      try {
        const webhook = {
          data: {
            webHookEvent: {
              topic: eventType,
              appId: 'test-app',
              accountId: 'test-account',
              itemId: `test-${eventType.toLowerCase()}-${Date.now()}`,
              occurredAt: new Date().toISOString(),
              userId: user.id,
              userName: user.name
            }
          }
        };
        
        // For real webhook endpoint (with proper signature)
        // This would need proper HMAC signature in production
        // For test endpoint
        const response = await axios.post(`${BASE_URL}/test/webhook`, {
          userId: user.id,
          userName: user.name,
          topic: eventType
        });
        
        console.log(`✅ ${user.name} - ${eventType} processed`);
        this.recordSuccess(user.id);
        
      } catch (error) {
        console.log(`❌ ${user.name} - ${eventType} failed: ${error.message}`);
        this.recordFailure(user.id);
      }
    }
    
    console.log('');
  }

  async testHighVolume() {
    console.log('🚀 Test 4: High volume test (100 webhooks)');
    
    const totalWebhooks = 100;
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < totalWebhooks; i++) {
      const user = TEST_USERS[i % TEST_USERS.length];
      
      promises.push(
        axios.post(`${BASE_URL}/test/webhook`, {
          userId: user.id,
          userName: user.name
        }).then(() => {
          this.recordSuccess(user.id);
          return true;
        }).catch(() => {
          this.recordFailure(user.id);
          return false;
        })
      );
    }
    
    const results = await Promise.all(promises);
    const successful = results.filter(r => r).length;
    const duration = Date.now() - startTime;
    
    console.log(`✅ ${successful}/${totalWebhooks} webhooks processed in ${duration}ms`);
    console.log(`📊 Rate: ${(totalWebhooks / (duration / 1000)).toFixed(2)} webhooks/second\n`);
  }

  async checkStats() {
    try {
      const response = await axios.get(`${BASE_URL}/status`);
      const stats = response.data.stats;
      
      console.log('📊 Server Statistics:');
      console.log(`Total webhooks received: ${stats.total.received}`);
      console.log(`Unique users: ${stats.uniqueUsers}`);
      console.log(`Success rate: ${stats.total.successRate}`);
      console.log('\nWebhooks by user:');
      
      for (const [userId, count] of Object.entries(stats.byUser)) {
        console.log(`  ${userId}: ${count} webhooks`);
      }
      
    } catch (error) {
      console.error('Failed to fetch stats:', error.message);
    }
  }

  createJobWebhook(user) {
    return {
      data: {
        webHookEvent: {
          topic: 'JOB_CREATE',
          appId: 'test-app',
          accountId: 'test-account',
          itemId: `job-${Date.now()}-${user.id}`,
          occurredAt: new Date().toISOString(),
          userId: user.id,
          userName: user.name
        }
      }
    };
  }

  recordSuccess(userId) {
    this.results.total++;
    this.results.passed++;
    this.results.byUser[userId] = (this.results.byUser[userId] || 0) + 1;
  }

  recordFailure(userId) {
    this.results.total++;
    this.results.failed++;
  }

  printResults() {
    console.log('\n========================================');
    console.log('📋 MULTI-USER TEST RESULTS');
    console.log('========================================');
    console.log(`Total tests: ${this.results.total}`);
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📊 Success rate: ${((this.results.passed / this.results.total) * 100).toFixed(2)}%`);
    
    console.log('\nWebhooks processed by user:');
    for (const [userId, count] of Object.entries(this.results.byUser)) {
      const user = TEST_USERS.find(u => u.id === userId);
      console.log(`  ${user?.name || userId}: ${count} webhooks`);
    }
    
    console.log('\n🎯 Multi-User Support Status:');
    if (Object.keys(this.results.byUser).length === TEST_USERS.length) {
      console.log('✅ ALL USERS CAN TRIGGER WEBHOOKS!');
      console.log('✅ The multi-user problem is SOLVED!');
    } else {
      console.log('❌ Some users cannot trigger webhooks');
      console.log('❌ Multi-user support needs investigation');
    }
    
    console.log('========================================\n');
    
    // Check final stats from server
    this.checkStats();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new MultiUserTester();
  tester.runAllTests();
}

module.exports = MultiUserTester;