# 🚀 Code Quality Predictor SaaS - Complete System

A professional SaaS platform that transforms code quality analysis into a monetized service with comprehensive security, subscription management, and VS Code extension integration.

## 🏗️ System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   VS Code       │    │   Frontend      │    │   Backend API   │
│   Extension     │◄──►│   Dashboard     │◄──►│   (Node.js)     │
│                 │    │   (React)       │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                       ┌─────────────────┐              │
                       │     Stripe      │◄─────────────┤
                       │   (Payments)    │              │
                       └─────────────────┘              │
                                                        │
                       ┌─────────────────┐              │
                       │  PostgreSQL     │◄─────────────┤
                       │  (Database)     │              │
                       └─────────────────┘              │
                                                        │
                       ┌─────────────────┐              │
                       │     Redis       │◄─────────────┘
                       │  (Rate Limit)   │
                       └─────────────────┘
```

## 💰 Monetization Strategy

### Subscription Tiers
- **Free**: 20 analyses/month, basic quality scoring
- **Pro ($12.99/month)**: 1,000 analyses/month, AI predictions, team collaboration
- **Team ($39.99/month)**: Unlimited analyses, team dashboard, API access

### Revenue Projections
- **Year 1 Target**: $74,400 ARR
- **Conversion Rate Goal**: 8-12% (vs 2-5% industry average)
- **Target Users**: 31M+ developers worldwide

## 🛡️ Security Framework

### Implemented Security Controls
- **Authentication**: JWT tokens with proper validation
- **Authorization**: Role-based access control (RBAC)
- **Input Validation**: Joi schema validation
- **Rate Limiting**: Tiered rate limits per subscription
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Content Security Policy
- **Payment Security**: PCI DSS compliant via Stripe
- **Data Encryption**: TLS 1.2+ for all communications

### Penetration Testing
Comprehensive security assessments included:
- OWASP ZAP Full Scan Report
- Burp Suite Professional Assessment
- Nessus Vulnerability Assessment
- Manual Penetration Testing Report

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL (via Docker)
- Stripe Account (for payments)

### 1. Clone and Setup
```bash
git clone <repository>
cd windsu-credit-manager
chmod +x setup-dev.sh
./setup-dev.sh
```

### 2. Start Development Servers
```bash
# Terminal 1 - Backend API
cd backend
npm run dev

# Terminal 2 - Frontend Dashboard
cd frontend
npm run dev

# Terminal 3 - VS Code Extension Development
cd .
npm run compile:watch
```

### 3. Access Services
- **Backend API**: http://localhost:3001
- **Frontend Dashboard**: http://localhost:3000
- **Database Admin**: http://localhost:5050
- **API Health**: http://localhost:3001/health

## 📊 API Endpoints

### Authentication
```bash
# Register new user
POST /api/v1/auth/register
{
  "email": "user@example.com",
  "password": "securepassword",
  "full_name": "John Doe"
}

# Login
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

### Code Analysis
```bash
# Analyze code
POST /api/v1/analysis/analyze
Authorization: Bearer <token>
{
  "code": "function example() { ... }",
  "file_path": "src/example.js",
  "project_name": "My Project"
}

# Get analysis history
GET /api/v1/analysis/history?page=1&limit=20
Authorization: Bearer <token>
```

### Subscription Management
```bash
# Get subscription plans
GET /api/v1/subscription/plans

# Create subscription
POST /api/v1/subscription/create
Authorization: Bearer <token>
{
  "plan_id": "pro",
  "billing_cycle": "monthly"
}
```

## 🗄️ Database Schema

### Key Tables
- **auth_users**: User authentication data
- **profiles**: User profile information
- **subscription_plans**: Available subscription tiers
- **user_subscriptions**: User subscription status
- **usage_tracking**: Monthly usage limits
- **quality_analyses**: Code analysis results
- **api_keys**: VS Code extension authentication

### Sample Queries
```sql
-- Check user subscription status
SELECT 
  p.email,
  s.plan_id,
  s.status,
  sp.analysis_limit
FROM profiles p
JOIN user_subscriptions s ON p.id = s.user_id
JOIN subscription_plans sp ON s.plan_id = sp.id
WHERE p.email = 'user@example.com';

-- Get usage statistics
SELECT 
  month_year,
  analyses_used,
  (SELECT analysis_limit FROM subscription_plans sp 
   JOIN user_subscriptions us ON sp.id = us.plan_id 
   WHERE us.user_id = ut.user_id) as limit
FROM usage_tracking ut
WHERE user_id = '123e4567-e89b-12d3-a456-426614174000';
```

## 🔧 VS Code Extension Integration

### Configuration
```json
{
  "codeQuality.apiEndpoint": "http://localhost:3001",
  "codeQuality.apiKey": "your-api-key",
  "codeQuality.autoAnalysis": true,
  "codeQuality.qualityThreshold": 75
}
```

### Features
- Real-time code quality analysis
- Usage limit enforcement
- Subscription upgrade prompts
- Quality metrics visualization
- Team collaboration features

## 💳 Payment Integration

### Stripe Configuration
```javascript
// Frontend - Payment Intent
const stripe = await loadStripe(process.env.STRIPE_PUBLISHABLE_KEY);
const { client_secret } = await createSubscription({
  plan_id: 'pro',
  billing_cycle: 'monthly'
});

// Backend - Webhook Handling
app.post('/api/v1/webhooks/stripe', (req, res) => {
  const signature = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(
    req.body, signature, process.env.STRIPE_WEBHOOK_SECRET
  );
  // Process payment events
});
```

### Webhook Events
- `payment_intent.succeeded`: Activate subscription
- `payment_intent.payment_failed`: Handle failed payments
- `invoice.payment_succeeded`: Renew subscription
- `customer.subscription.deleted`: Cancel subscription

## 📈 Monitoring & Analytics

### Key Metrics Tracked
- Monthly Recurring Revenue (MRR)
- Customer Acquisition Cost (CAC)
- Lifetime Value (LTV)
- Free-to-paid conversion rate
- API usage patterns
- Code quality trends

### Dashboards
- User subscription analytics
- Usage limit monitoring
- Revenue tracking
- Security incident reports

## 🔐 Environment Variables

### Backend (.env)
```bash
# Database
DATABASE_URL=postgresql://postgres:postgres123@localhost:5433/code_quality_predictor

# JWT Secrets
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Redis
REDIS_URL=redis://localhost:6379

# Email
SMTP_HOST=smtp.mailtrap.io
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-pass
```

### Frontend (.env)
```bash
VITE_API_URL=http://localhost:3001
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test                    # Unit tests
npm run test:integration   # Integration tests
npm run test:security     # Security tests
```

### Frontend Tests
```bash
cd frontend
npm test                  # Component tests
npm run test:e2e         # End-to-end tests
```

### API Testing
```bash
# Health check
curl http://localhost:3001/health

# Register user
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","full_name":"Test User"}'

# Test rate limiting
for i in {1..10}; do 
  curl -X POST http://localhost:3001/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'; 
done
```

## 🚀 Deployment

### Production Environment - Netlify + Supabase
```bash
# 1. Set up Supabase database
# Run backend/src/database/schema.sql in Supabase SQL Editor

# 2. Configure Netlify
# Connect GitHub repo, set environment variables
# Functions: backend/netlify/functions
# Publish: frontend/dist

# 3. Configure Stripe webhooks
# Endpoint: https://your-app.netlify.app/api/v1/webhooks/stripe

# 4. Deploy
git push origin main  # Auto-deploys via Netlify
```

### Environment-Specific Configuration
- **Development**: Local PostgreSQL + Docker, test Stripe keys
- **Production**: Supabase + Netlify Functions, live Stripe keys

📖 **Complete deployment guide**: See `DEPLOYMENT.md`

## 📚 Documentation

### Available Documents
- `SECURITY_FRAMEWORK.md`: Comprehensive security documentation
- `MONETIZATION_STRATEGY.md`: Business model and pricing strategy
- `security/penetration-tests/`: Security assessment reports
- `backend/src/database/`: Database schema and migrations
- `frontend/src/components/`: React component documentation

### API Documentation
Interactive API docs available at: http://localhost:3001/docs

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Run security tests (`npm run test:security`)
4. Commit changes (`git commit -m 'Add amazing feature'`)
5. Push to branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Code Standards
- ESLint configuration for JavaScript/TypeScript
- Prettier for code formatting
- Joi schemas for API validation
- Jest for testing
- Security-focused code reviews

## 📋 Roadmap

### Phase 1 (Q1 2024) ✅
- [x] VS Code extension with basic analysis
- [x] Backend API with authentication
- [x] PostgreSQL database setup
- [x] Stripe payment integration
- [x] Security framework implementation

### Phase 2 (Q2 2024)
- [ ] Frontend React dashboard
- [ ] Team collaboration features
- [ ] Advanced ML models
- [ ] GitHub/GitLab integrations
- [ ] Mobile app (React Native)

### Phase 3 (Q3 2024)
- [ ] Enterprise features
- [ ] White-label solutions
- [ ] API marketplace
- [ ] Advanced analytics
- [ ] Multi-language support

### Phase 4 (Q4 2024)
- [ ] AI-powered code suggestions
- [ ] Automated code fixes
- [ ] IDE integrations (IntelliJ, etc.)
- [ ] Enterprise SSO
- [ ] Custom ML model training

## 🆘 Troubleshooting

### Common Issues

**Database Connection Failed**
```bash
# Check if PostgreSQL is running
docker-compose ps
# Restart if needed
docker-compose restart postgres
```

**Backend Won't Start**
```bash
# Check environment variables
cd backend && cat .env
# Install dependencies
npm install
```

**VS Code Extension Not Working**
```bash
# Rebuild extension
npm run compile
# Check API endpoint configuration
```

**Payment Integration Issues**
```bash
# Verify Stripe keys in .env
# Check webhook endpoint URL
# Test with Stripe CLI
stripe listen --forward-to localhost:3001/api/v1/webhooks/stripe
```

## 📞 Support

### Getting Help
- **Documentation**: Check this README and related docs
- **Issues**: Create GitHub issues for bugs
- **Security**: Report security issues privately
- **Business**: Contact for partnership opportunities

### Performance Optimization
- Redis caching for API responses
- Database query optimization
- CDN for static assets
- Load balancing for high traffic

---

## 🎉 Success Metrics

**Technical Metrics**
- 99.9% API uptime
- <200ms average response time
- 0 critical security vulnerabilities
- 95%+ test coverage

**Business Metrics**
- $6,200 MRR by end of Year 1
- 8-12% free-to-paid conversion
- <5% monthly churn rate
- 4.5+ star rating on VS Code marketplace

---

**Built with ❤️ for developers who care about code quality**

Transform your development workflow with AI-powered code analysis, comprehensive team collaboration, and enterprise-grade security. Start your journey to better code today! 🚀