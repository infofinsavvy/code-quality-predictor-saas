# 🚀 Deployment Guide - Netlify + Supabase Integration

This guide covers deploying the Code Quality Predictor SaaS to production using Netlify for hosting and Supabase for the database.

## 📋 Prerequisites

- [Netlify Account](https://netlify.com)
- [Supabase Account](https://supabase.com)
- [Stripe Account](https://stripe.com)
- GitHub repository with your code

## 🗄️ Step 1: Set Up Supabase Database

### 1.1 Create Supabase Project
```bash
# Go to https://supabase.com and create a new project
# Note down your project URL and API keys
```

### 1.2 Run Database Schema
```sql
-- Go to SQL Editor in Supabase Dashboard
-- Copy and paste the contents of backend/src/database/schema.sql
-- Execute the schema to create all tables and functions
```

### 1.3 Configure RLS Policies
The schema includes Row Level Security policies. Verify they're enabled:
```sql
-- Check RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = true;
```

### 1.4 Set Up Stripe Integration in Supabase
```sql
-- Add Stripe price IDs to subscription plans
UPDATE public.subscription_plans 
SET stripe_price_id = 'price_free_plan_id' 
WHERE id = 'free';

UPDATE public.subscription_plans 
SET stripe_price_id = 'price_pro_monthly_id' 
WHERE id = 'pro';

UPDATE public.subscription_plans 
SET stripe_price_id = 'price_team_monthly_id' 
WHERE id = 'team';
```

## 💳 Step 2: Configure Stripe

### 2.1 Create Products and Prices
```bash
# In Stripe Dashboard, create products:
# 1. "Pro Plan" - $12.99/month
# 2. "Team Plan" - $39.99/month
# 3. Copy the price IDs for the database update above
```

### 2.2 Configure Webhooks
```bash
# Add webhook endpoint in Stripe Dashboard:
# URL: https://your-app.netlify.app/api/v1/webhooks/stripe
# Events to listen for:
# - payment_intent.succeeded
# - customer.subscription.deleted
# - invoice.payment_succeeded
# - invoice.payment_failed
```

## 🌐 Step 3: Deploy to Netlify

### 3.1 Connect GitHub Repository
```bash
# 1. Go to Netlify Dashboard
# 2. Click "New site from Git"
# 3. Connect your GitHub repository
# 4. Set build settings:
#    - Build command: cd backend && npm install && npm run build
#    - Publish directory: frontend/dist
#    - Functions directory: backend/netlify/functions
```

### 3.2 Configure Environment Variables
In Netlify Dashboard → Site Settings → Environment Variables:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT
JWT_SECRET=your-super-secret-jwt-key-make-it-long-and-random
JWT_REFRESH_SECRET=your-refresh-secret-also-long-and-random

# Stripe
STRIPE_SECRET_KEY=sk_live_your_live_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_live_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Frontend
VITE_API_URL=https://your-app.netlify.app/api/v1
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_live_publishable_key

# Optional
SMTP_HOST=smtp.your-email-provider.com
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
FROM_EMAIL=noreply@your-domain.com
```

### 3.3 Configure Build Settings
Create or update `netlify.toml`:
```toml
[build]
  command = "cd frontend && npm install && npm run build"
  functions = "backend/netlify/functions"
  publish = "frontend/dist"

[build.environment]
  NODE_VERSION = "18"

[functions]
  node_bundler = "esbuild"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

## 📱 Step 4: Frontend Build Configuration

### 4.1 Update API Endpoint
```javascript
// frontend/src/config/api.js
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://your-app.netlify.app/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

### 4.2 Configure Stripe
```javascript
// frontend/src/utils/stripe.js
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
export default stripePromise;
```

## 🔧 Step 5: VS Code Extension Configuration

### 5.1 Update Extension Settings
```json
// package.json - update default settings
{
  "contributes": {
    "configuration": {
      "properties": {
        "codeQuality.apiEndpoint": {
          "type": "string",
          "default": "https://your-app.netlify.app/api/v1",
          "description": "API endpoint for code quality analysis"
        }
      }
    }
  }
}
```

### 5.2 Update Extension Code
```typescript
// src/extension.ts - update API endpoint
const API_ENDPOINT = vscode.workspace.getConfiguration('codeQuality').get('apiEndpoint') 
  || 'https://your-app.netlify.app/api/v1';
```

## 🧪 Step 6: Testing Deployment

### 6.1 Test API Endpoints
```bash
# Health check
curl https://your-app.netlify.app/api/health

# User registration
curl -X POST https://your-app.netlify.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","full_name":"Test User"}'

# Code analysis (requires auth token)
curl -X POST https://your-app.netlify.app/api/analysis/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"code":"function test() { return true; }","file_path":"test.js","project_name":"Test"}'
```

### 6.2 Test Stripe Integration
```bash
# Use Stripe test cards in frontend
# 4242424242424242 - Success
# 4000000000000002 - Declined
```

### 6.3 Test VS Code Extension
```bash
# Install extension in VS Code
# Configure API endpoint
# Test code analysis on sample files
```

## 📊 Step 7: Monitoring & Analytics

### 7.1 Set Up Netlify Analytics
```bash
# Enable Netlify Analytics in dashboard
# Monitor function execution times
# Track bandwidth usage
```

### 7.2 Supabase Monitoring
```bash
# Monitor database performance
# Set up usage alerts
# Track API usage
```

### 7.3 Stripe Dashboard
```bash
# Monitor subscription metrics
# Set up webhook monitoring
# Track failed payments
```

## 🔒 Step 8: Security Checklist

### 8.1 Environment Variables
- ✅ All secrets stored in Netlify environment variables
- ✅ No secrets in code repository
- ✅ Production Stripe keys configured
- ✅ Strong JWT secrets generated

### 8.2 Database Security
- ✅ RLS policies enabled and tested
- ✅ Service role key secured
- ✅ Database backups configured

### 8.3 API Security
- ✅ CORS configured properly
- ✅ Rate limiting implemented
- ✅ Input validation active
- ✅ Stripe webhook signature verification

## 🚨 Step 9: Error Handling & Debugging

### 9.1 Common Issues

**Netlify Function Cold Starts**
```javascript
// Implement connection pooling
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.SUPABASE_URL });
```

**CORS Issues**
```javascript
// Ensure headers are set correctly
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};
```

**Database Connection Issues**
```bash
# Check Supabase connection limits
# Implement connection pooling
# Use Supabase client for better connection management
```

### 9.2 Debugging Tools
```bash
# Netlify function logs
netlify functions:log

# Supabase logs
# Check Logs section in Supabase dashboard

# Stripe webhook logs
# Check webhook attempts in Stripe dashboard
```

## 📈 Step 10: Performance Optimization

### 10.1 Frontend Optimization
```bash
# Build optimizations
npm run build -- --analyze

# Bundle size optimization
# Code splitting
# Lazy loading
```

### 10.2 Backend Optimization
```bash
# Database query optimization
# Connection pooling
# Caching strategies
# CDN for static assets
```

### 10.3 Monitoring Performance
```bash
# Netlify Analytics
# Lighthouse scores
# Database performance metrics
# Stripe checkout conversion rates
```

## 🎯 Step 11: Go Live Checklist

- [ ] Database schema applied to production
- [ ] All environment variables configured
- [ ] Stripe products and webhooks configured
- [ ] Domain configured (optional)
- [ ] SSL certificate active
- [ ] Analytics tracking setup
- [ ] Error monitoring configured
- [ ] Backup strategy implemented
- [ ] Documentation updated
- [ ] Team access configured

## 🔄 Step 12: Post-Deployment

### 12.1 Monitor Key Metrics
- API response times
- Database query performance
- Payment success rates
- User registration/conversion rates
- Extension downloads and usage

### 12.2 Regular Maintenance
- Update dependencies monthly
- Review security patches
- Monitor usage limits
- Backup database regularly
- Review and optimize slow queries

---

## 📞 Support & Resources

- **Netlify Docs**: https://docs.netlify.com
- **Supabase Docs**: https://supabase.com/docs
- **Stripe Integration**: https://stripe.com/docs/api
- **VS Code Extension**: https://code.visualstudio.com/api

**🎉 Your Code Quality Predictor SaaS is now live and ready to scale!**