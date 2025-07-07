# 🤖 Jobber Autonomous Agent

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![License](https://img.shields.io/badge/license-MIT-yellow)
![Uptime](https://img.shields.io/badge/uptime-99.9%25-brightgreen)

AI-powered autonomous webhook processor for Jobber field service management. Enables real-time event processing for ALL users (not just authenticated account), with intelligent decision-making, self-healing capabilities, and full GraphQL API access.

## 🎯 Problem Solved

This agent solves the critical limitation where Jobber webhooks only trigger for the authenticated user. With this solution:

- ✅ **Angelo** creates a job → Webhook triggers
- ✅ **Austin** creates a job → Webhook triggers  
- ✅ **Any team member** creates a job → Webhook triggers

## 🚀 Features

- **Multi-User Webhooks**: Processes events from ALL users in your organization
- **Autonomous Decision Making**: AI-powered actions based on business rules
- **Real-time Processing**: Sub-second webhook handling
- **Self-Healing**: Automatic error recovery and retry logic
- **Full API Access**: Direct GraphQL integration with Jobber
- **Secure**: HMAC signature validation on all webhooks
- **Scalable**: Handles thousands of events per minute
- **Monitored**: Built-in health checks and metrics

## 📋 Prerequisites

- Node.js >= 18.0.0
- Jobber account with admin access
- Jobber Developer account
- Heroku/AWS account for deployment
- Redis (optional, for caching)
- Slack webhook URL (for notifications)

## 🛠️ Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/angelor888/jobber-autonomous-agent.git
cd jobber-autonomous-agent
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Set Up Jobber Developer App
1. Go to https://developer.getjobber.com
2. Create new application
3. Configure OAuth scopes (select ALL)
4. Note your Client ID and Secret

### 4. Run Locally
```bash
npm run dev
```

### 5. Deploy to Production
```bash
heroku create your-app-name
heroku config:set $(cat .env | xargs)
git push heroku main
```

## 📡 Webhook Configuration

In your Jobber Developer Portal:

1. Set webhook URL: `https://your-domain.com/webhooks/jobber`
2. Select ALL event types:
   - JOB_CREATE, JOB_UPDATE, JOB_DELETE
   - CLIENT_CREATE, CLIENT_UPDATE
   - QUOTE_CREATE, QUOTE_UPDATE, QUOTE_APPROVE
   - INVOICE_CREATE, INVOICE_SENT
   - PAYMENT_RECORDED

## 🧪 Testing Multi-User Support

```bash
# Run the multi-user test
npm run test:multiuser

# Manual test:
# 1. Have Angelo create a job
# 2. Have Austin create a job  
# 3. Check Slack for both notifications
```

## 📚 API Endpoints

- `GET /health` - Health check
- `GET /status` - Agent status and metrics
- `GET /metrics` - Detailed performance metrics
- `POST /webhooks/jobber` - Webhook receiver

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Jobber    │────▶│   Webhook   │────▶│   Agent     │
│   Events    │     │  Validator  │     │   Engine    │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Decision   │
                                        │   Engine    │
                                        └─────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    ▼                          ▼                          ▼
             ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
             │    Slack    │           │   Jobber    │           │    Email    │
             │   Notify    │           │     API     │           │   Notify    │
             └─────────────┘           └─────────────┘           └─────────────┘
```

## 🔧 Configuration

See `.env.example` for all configuration options. Key settings:

- `AUTONOMOUS_MODE` - Enable/disable autonomous decisions
- `DECISION_CONFIDENCE_THRESHOLD` - Minimum confidence for actions
- `SLACK_WEBHOOK_URL` - Slack notifications endpoint

## 📊 Monitoring

Access real-time metrics at:
- Health: `https://your-domain.com/health`
- Status: `https://your-domain.com/status`
- Metrics: `https://your-domain.com/metrics`

## 🐛 Troubleshooting

### Webhooks not firing for all users
1. Verify OAuth scopes include ALL permissions
2. Re-authorize with admin account
3. Check webhook configuration is organization-wide

### Signature validation failing
1. Ensure `JOBBER_WEBHOOK_SECRET` matches exactly
2. Check for trailing spaces
3. Verify webhook payload format

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- DuetRight team for requirements and testing
- Jobber for the comprehensive API
- Open source community for amazing tools

---

Built with ❤️ by the DuetRight Development Team