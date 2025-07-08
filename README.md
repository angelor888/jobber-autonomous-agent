# 🤖 Jobber Autonomous Agent

> **THE Multi-User Webhook Solution for Jobber** - Receives webhooks for ALL users, not just the authenticated account!

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/duetright/jobber-autonomous-agent)
[![Multi-User](https://img.shields.io/badge/multi--user-enabled-success.svg)](https://github.com/duetright/jobber-autonomous-agent)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## 🎯 Problem Solved

**Original Issue**: Jobber webhooks only triggered for the authenticated user (Angelo), not for other team members (Austin, etc.)

**Solution**: This autonomous agent receives webhooks for **ALL users** in your Jobber organization through proper webhook configuration.

## ✨ Features

- **🚀 Multi-User Webhooks** - Works for Angelo, Austin, and everyone else!
- **🧠 Autonomous Decision Making** - AI-powered actions based on business rules
- **🔄 Self-Healing** - Automatic error recovery and retry logic
- **📊 Real-Time Monitoring** - Dashboard and metrics for all webhook activity
- **🔐 Secure** - HMAC signature validation on all webhooks
- **⚡ High Performance** - Handles thousands of webhooks per minute
- **🎨 Extensible** - Easy to add new rules and actions

## 🚀 Quick Start

### Prerequisites

- Node.js >= 16.0.0
- Jobber Developer Account
- Domain with SSL certificate (for production)

### 1. Clone & Install

```bash
git clone https://github.com/duetright/jobber-autonomous-agent.git
cd jobber-autonomous-agent
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# REQUIRED - Get from Jobber Developer Portal
JOBBER_CLIENT_ID=your_client_id_here
JOBBER_CLIENT_SECRET=your_client_secret_here
JOBBER_REDIRECT_URI=https://your-domain.com/auth/callback

# Your server URL
BASE_URL=https://your-domain.com

# Optional but recommended
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### 3. Create Jobber App

1. Go to [Jobber Developer Portal](https://developer.getjobber.com)
2. Create new app: "Your Company Autonomous Agent"
3. Set OAuth redirect: `https://your-domain.com/auth/callback`
4. Select ALL required scopes:
   - ✅ clients:read/write
   - ✅ jobs:read/write
   - ✅ quotes:read/write
   - ✅ invoices:read/write
   - ✅ users:read
   - ✅ schedule:read

### 4. Configure Webhooks (CRITICAL!)

In Jobber Developer Portal → Your App → Webhooks:

1. **Webhook URL**: `https://your-domain.com/webhooks/jobber`
2. **Select Events**:
   - ✅ JOB_CREATE
   - ✅ JOB_UPDATE
   - ✅ CLIENT_CREATE
   - ✅ QUOTE_CREATE
   - ✅ INVOICE_CREATE
   - (Select all events you want to monitor)

**⚠️ IMPORTANT**: These webhooks will trigger for ALL users in your organization!

### 5. Start the Agent

```bash
# Development
npm run dev

# Production
npm start

# With PM2
pm2 start ecosystem.config.js
```

### 6. Verify Multi-User Support

```bash
# Run the multi-user test
npm test

# Check status
curl http://localhost:3000/status

# You should see:
# "multiUserEnabled": true
# "uniqueUsers": 4  (or more)
```

## 🧪 Testing Multi-User Webhooks

The critical test is ensuring ALL users trigger webhooks:

1. **Angelo creates a job** → Webhook received ✅
2. **Austin creates a job** → Webhook received ✅
3. **Any team member creates a job** → Webhook received ✅

Run the included test:

```bash
node test/multi-user.test.js
```

## 🏗️ Architecture

```
Jobber (ANY User Action)
         ↓
    Webhook Event
         ↓
  Signature Validation
         ↓
    Event Queue
         ↓
  Decision Engine (AI)
         ↓
   Autonomous Actions
         ↓
   Notifications
```

## 📋 Available Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhooks/jobber` | POST | Receives Jobber webhooks |
| `/health` | GET | Health check |
| `/status` | GET | Current status and stats |
| `/metrics` | GET | Detailed metrics |
| `/test/webhook` | POST | Test webhook endpoint |

## 🤖 Autonomous Rules

The agent includes pre-configured rules for:

- **Emergency Detection** - Immediate response for urgent keywords
- **VIP Client Handling** - Premium service for high-value clients
- **Auto-Assignment** - Smart technician assignment
- **Capacity Management** - Workload balancing
- **Quality Control** - Automatic inspection scheduling

## 🚀 Deployment

### Heroku (Recommended)

```bash
heroku create your-app-name
heroku config:set JOBBER_CLIENT_ID=xxx
heroku config:set JOBBER_CLIENT_SECRET=xxx
heroku config:set JOBBER_REDIRECT_URI=https://your-app.herokuapp.com/auth/callback
git push heroku main
```

### Docker

```bash
docker-compose up -d
```

### Traditional Server

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 config
pm2 save
pm2 startup
```

## 📊 Monitoring

Check webhook statistics:

```bash
curl http://localhost:3000/status | jq .
```

Response shows:
- Total webhooks processed
- Webhooks by user (proves multi-user is working!)
- Success rate
- Current queue length

## 🛠️ Troubleshooting

### Webhooks Only Working for One User?

1. Check `/status` endpoint - `uniqueUsers` should be > 1
2. Verify webhook configuration in Jobber is organization-wide
3. Ensure `MULTI_USER_ENABLED` is not set to `false`
4. Run multi-user test: `npm test`

### Webhooks Not Receiving?

1. Verify webhook URL is publicly accessible
2. Check SSL certificate is valid
3. Confirm JOBBER_CLIENT_SECRET matches exactly
4. Look for signature validation errors in logs

### High Memory Usage?

1. Check queue length: `curl localhost:3000/status`
2. Adjust `QUEUE_MAX_SIZE` in environment
3. Scale horizontally with multiple instances

## 📚 Documentation

- [Setup SOP](docs/sop/DR-SOP-IT-JobberAgentSetup-v1.0-20250107.md)
- [Operations Guide](docs/operations-guide.md)
- [API Documentation](docs/api.md)
- [Troubleshooting Guide](docs/troubleshooting.md)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file.

## 🙏 Acknowledgments

- Built to solve real-world Jobber webhook limitations
- Designed for DuetRight's field service operations
- Powered by Node.js and Express

---

**Remember**: The key feature is **multi-user webhook support**. If it's not working for all users, check the troubleshooting guide!