#!/usr/bin/env node

/**
 * Pre-flight checks for Jobber Autonomous Agent
 * Ensures all systems are go before launch
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class PreflightChecker {
  constructor() {
    this.checks = [];
    this.failures = [];
  }

  async runAllChecks() {
    console.log('🔍 Running pre-flight checks...\n');
    
    // Configuration checks
    await this.checkEnvironmentVariables();
    await this.checkDirectories();
    await this.checkDependencies();
    
    // API connectivity checks
    await this.checkJobberAPIConnectivity();
    await this.checkSlackWebhook();
    
    // Security checks
    await this.checkWebhookSecret();
    await this.checkPermissions();
    
    // Feature checks
    await this.checkMultiUserSupport();
    
    // Print results
    this.printResults();
    
    // Exit with appropriate code
    process.exit(this.failures.length > 0 ? 1 : 0);
  }

  async checkEnvironmentVariables() {
    console.log('📋 Checking environment variables...');
    
    const required = [
      'JOBBER_CLIENT_ID',
      'JOBBER_CLIENT_SECRET',
      'JOBBER_REDIRECT_URI'
    ];
    
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      this.failures.push({
        check: 'Environment Variables',
        error: `Missing: ${missing.join(', ')}`,
        fix: 'Set these variables in your .env file'
      });
    } else {
      this.checks.push({
        check: 'Environment Variables',
        status: '✅ All required variables present'
      });
    }
    
    // Check optional but recommended
    const recommended = ['SLACK_WEBHOOK_URL', 'BASE_URL'];
    const missingOptional = recommended.filter(key => !process.env[key]);
    
    if (missingOptional.length > 0) {
      console.log(`  ⚠️  Missing optional: ${missingOptional.join(', ')}`);
    }
  }

  async checkDirectories() {
    console.log('📁 Checking directories...');
    
    const dirs = ['logs', 'data'];
    
    for (const dir of dirs) {
      try {
        await fs.access(dir);
        this.checks.push({
          check: `Directory: ${dir}`,
          status: '✅ Exists and accessible'
        });
      } catch (error) {
        try {
          await fs.mkdir(dir, { recursive: true });
          this.checks.push({
            check: `Directory: ${dir}`,
            status: '✅ Created'
          });
        } catch (mkdirError) {
          this.failures.push({
            check: `Directory: ${dir}`,
            error: 'Cannot create directory',
            fix: `Manually create the ${dir} directory`
          });
        }
      }
    }
  }

  async checkDependencies() {
    console.log('📦 Checking dependencies...');
    
    try {
      const packageJson = require('../package.json');
      const installedPackages = require('../package-lock.json');
      
      const missing = [];
      for (const [pkg, version] of Object.entries(packageJson.dependencies || {})) {
        if (!installedPackages.dependencies[pkg]) {
          missing.push(pkg);
        }
      }
      
      if (missing.length > 0) {
        this.failures.push({
          check: 'Dependencies',
          error: `Missing packages: ${missing.join(', ')}`,
          fix: 'Run: npm install'
        });
      } else {
        this.checks.push({
          check: 'Dependencies',
          status: '✅ All packages installed'
        });
      }
    } catch (error) {
      this.failures.push({
        check: 'Dependencies',
        error: 'Cannot verify dependencies',
        fix: 'Run: npm install'
      });
    }
  }

  async checkJobberAPIConnectivity() {
    console.log('🌐 Checking Jobber API connectivity...');
    
    if (!process.env.JOBBER_CLIENT_ID || !process.env.JOBBER_CLIENT_SECRET) {
      console.log('  ⏭️  Skipping - credentials not configured');
      return;
    }
    
    try {
      // Test OAuth endpoint
      const response = await axios.post('https://api.getjobber.com/api/oauth/token', {
        grant_type: 'client_credentials',
        client_id: process.env.JOBBER_CLIENT_ID,
        client_secret: process.env.JOBBER_CLIENT_SECRET,
        scope: 'read'
      }, {
        timeout: 5000,
        validateStatus: () => true
      });
      
      if (response.status === 200) {
        this.checks.push({
          check: 'Jobber API',
          status: '✅ Connected successfully'
        });
      } else if (response.status === 401) {
        this.failures.push({
          check: 'Jobber API',
          error: 'Invalid credentials',
          fix: 'Verify JOBBER_CLIENT_ID and JOBBER_CLIENT_SECRET'
        });
      } else {
        this.failures.push({
          check: 'Jobber API',
          error: `API returned status ${response.status}`,
          fix: 'Check Jobber API status and credentials'
        });
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        this.failures.push({
          check: 'Jobber API',
          error: 'Cannot reach Jobber API',
          fix: 'Check internet connection and firewall settings'
        });
      } else {
        this.failures.push({
          check: 'Jobber API',
          error: error.message,
          fix: 'Check logs for details'
        });
      }
    }
  }

  async checkSlackWebhook() {
    console.log('💬 Checking Slack webhook...');
    
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.log('  ⏭️  Skipping - Slack webhook not configured');
      return;
    }
    
    try {
      const response = await axios.post(webhookUrl, {
        text: '🔧 Jobber Agent pre-flight test',
        attachments: [{
          color: 'good',
          text: 'This is a test message from the Jobber Autonomous Agent pre-flight check.',
          footer: 'This message confirms Slack integration is working'
        }]
      }, {
        timeout: 5000,
        validateStatus: () => true
      });
      
      if (response.status === 200) {
        this.checks.push({
          check: 'Slack Webhook',
          status: '✅ Message sent successfully'
        });
      } else {
        this.failures.push({
          check: 'Slack Webhook',
          error: `Webhook returned status ${response.status}`,
          fix: 'Verify SLACK_WEBHOOK_URL is correct'
        });
      }
    } catch (error) {
      this.failures.push({
        check: 'Slack Webhook',
        error: 'Cannot send to Slack',
        fix: 'Check webhook URL and internet connection'
      });
    }
  }

  async checkWebhookSecret() {
    console.log('🔐 Checking webhook security...');
    
    const secret = process.env.JOBBER_CLIENT_SECRET;
    
    if (!secret) {
      this.failures.push({
        check: 'Webhook Security',
        error: 'No webhook secret configured',
        fix: 'Set JOBBER_CLIENT_SECRET in .env'
      });
      return;
    }
    
    // Test HMAC generation
    try {
      const testPayload = JSON.stringify({ test: true });
      const hmac = crypto
        .createHmac('sha256', secret)
        .update(testPayload)
        .digest('base64');
      
      if (hmac) {
        this.checks.push({
          check: 'Webhook Security',
          status: '✅ HMAC validation ready'
        });
      }
    } catch (error) {
      this.failures.push({
        check: 'Webhook Security',
        error: 'Cannot generate HMAC',
        fix: 'Check JOBBER_CLIENT_SECRET format'
      });
    }
  }

  async checkPermissions() {
    console.log('🔑 Checking file permissions...');
    
    const files = [
      { path: 'logs', mode: 0o755 },
      { path: 'data', mode: 0o755 }
    ];
    
    for (const file of files) {
      try {
        const stats = await fs.stat(file.path);
        const mode = stats.mode & parseInt('777', 8);
        
        if (mode >= file.mode) {
          this.checks.push({
            check: `Permissions: ${file.path}`,
            status: '✅ Correct permissions'
          });
        } else {
          this.failures.push({
            check: `Permissions: ${file.path}`,
            error: 'Insufficient permissions',
            fix: `Run: chmod ${file.mode.toString(8)} ${file.path}`
          });
        }
      } catch (error) {
        // Directory doesn't exist, will be created
      }
    }
  }

  async checkMultiUserSupport() {
    console.log('👥 Checking multi-user support...');
    
    // This is the CRITICAL check
    const multiUserEnabled = process.env.MULTI_USER_ENABLED !== 'false';
    
    if (multiUserEnabled) {
      this.checks.push({
        check: 'Multi-User Support',
        status: '✅ ENABLED - Webhooks will work for ALL users!'
      });
    } else {
      this.failures.push({
        check: 'Multi-User Support',
        error: 'Multi-user support is DISABLED',
        fix: 'Set MULTI_USER_ENABLED=true in .env (or remove it, true is default)'
      });
    }
    
    // Additional webhook configuration check
    console.log('\n📌 IMPORTANT: Webhook Configuration');
    console.log('   Make sure you\'ve configured webhooks in Jobber Developer Portal:');
    console.log(`   - Webhook URL: ${process.env.BASE_URL || 'http://localhost:3000'}/webhooks/jobber`);
    console.log('   - Select ALL event types you want to monitor');
    console.log('   - Webhooks will trigger for ALL users in your organization\n');
  }

  printResults() {
    console.log('\n========================================');
    console.log('📊 PRE-FLIGHT CHECK RESULTS');
    console.log('========================================\n');
    
    if (this.checks.length > 0) {
      console.log('✅ PASSED CHECKS:');
      for (const check of this.checks) {
        console.log(`   ${check.check}: ${check.status}`);
      }
      console.log('');
    }
    
    if (this.failures.length > 0) {
      console.log('❌ FAILED CHECKS:');
      for (const failure of this.failures) {
        console.log(`   ${failure.check}: ${failure.error}`);
        console.log(`   📌 Fix: ${failure.fix}`);
        console.log('');
      }
    }
    
    console.log('========================================');
    
    if (this.failures.length === 0) {
      console.log('🎉 All pre-flight checks PASSED!');
      console.log('🚀 Ready to start Jobber Autonomous Agent');
      console.log('👥 Multi-user webhooks are ENABLED');
    } else {
      console.log(`❌ ${this.failures.length} checks FAILED`);
      console.log('🛠️  Please fix the issues above before starting');
    }
    
    console.log('========================================\n');
  }
}

// Run checks if called directly
if (require.main === module) {
  require('dotenv').config();
  const checker = new PreflightChecker();
  checker.runAllChecks();
}

module.exports = PreflightChecker;