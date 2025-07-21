import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize external services
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16'
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https://api.stripe.com"],
      scriptSrc: ["'self'", "https://js.stripe.com"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? ['https://app.code-quality-predictor.com', 'https://www.code-quality-predictor.com']
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting configurations
const rateLimiters = {
  auth: new RateLimiterRedis({
    storeClient: null, // Will use memory store for demo
    keyPrefix: 'rl_auth',
    points: 5, // Number of requests
    duration: 900, // Per 15 minutes
    blockDuration: 3600 // Block for 1 hour
  }),
  
  api: new RateLimiterRedis({
    storeClient: null,
    keyPrefix: 'rl_api',
    points: 100, // Requests per window
    duration: 900, // 15 minutes
    blockDuration: 60 // Block for 1 minute
  }),

  analysis: new RateLimiterRedis({
    storeClient: null,
    keyPrefix: 'rl_analysis',
    points: 10, // Analysis requests
    duration: 60, // Per minute
    blockDuration: 300 // Block for 5 minutes
  })
};

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'MISSING_TOKEN'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const { data: user, error } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        created_at,
        user_subscriptions (
          id,
          plan_id,
          status,
          current_period_end
        )
      `)
      .eq('id', decoded.sub)
      .single();

    if (error || !user) {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token format',
        code: 'MALFORMED_TOKEN'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'EXPIRED_TOKEN'
      });
    }
    
    return res.status(500).json({ 
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

// Usage limit middleware
const checkUsageLimit = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    // Check current usage and limits
    const { data, error } = await supabase
      .rpc('check_usage_limit', { 
        p_user_id: userId,
        p_increment: 1
      });

    if (error) {
      console.error('Usage check error:', error);
      return res.status(500).json({ 
        error: 'Unable to verify usage limits',
        code: 'USAGE_CHECK_ERROR'
      });
    }

    if (!data.allowed) {
      return res.status(429).json({
        error: 'Usage limit exceeded',
        code: 'USAGE_LIMIT_EXCEEDED',
        current_usage: data.current_usage,
        limit: data.limit,
        remaining: data.remaining,
        upgrade_url: '/subscription/upgrade'
      });
    }

    // Add usage info to request for logging
    req.usage = data;
    next();
  } catch (error) {
    console.error('Usage limit check failed:', error);
    res.status(500).json({ 
      error: 'Usage verification failed',
      code: 'USAGE_ERROR'
    });
  }
};

// Security middleware for sensitive operations
const requireCSRF = (req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const csrfToken = req.headers['x-csrf-token'];
    if (!csrfToken || csrfToken !== req.session?.csrfToken) {
      return res.status(403).json({ 
        error: 'CSRF token missing or invalid',
        code: 'CSRF_ERROR'
      });
    }
  }
  next();
};

// Input validation helper
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    req.validatedBody = value;
    next();
  };
};

// Routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Authentication routes
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    await rateLimiters.auth.consume(req.ip);
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Generate custom JWT with user info
    const token = jwt.sign(
      { 
        sub: data.user.id,
        email: data.user.email,
        iat: Math.floor(Date.now() / 1000)
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: '15m',
        issuer: 'code-quality-predictor',
        audience: 'api.code-quality-predictor.com'
      }
    );

    res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 900,
      user: {
        id: data.user.id,
        email: data.user.email
      }
    });

  } catch (rateLimitError) {
    res.status(429).json({
      error: 'Too many login attempts',
      code: 'RATE_LIMIT_EXCEEDED',
      retry_after: Math.round(rateLimitError.msBeforeNext / 1000)
    });
  }
});

// Code analysis endpoint
app.post('/api/v1/analysis/analyze', 
  authenticateToken,
  checkUsageLimit,
  async (req, res) => {
    try {
      await rateLimiters.analysis.consume(`${req.user.id}:analysis`);

      const { code, file_path, project_name } = req.body;

      if (!code || !file_path) {
        return res.status(400).json({
          error: 'Code content and file path are required',
          code: 'MISSING_REQUIRED_FIELDS'
        });
      }

      // Sanitize inputs
      const sanitizedFilePath = file_path.replace(/[^a-zA-Z0-9\-_\/\.]/g, '');
      
      // Perform code analysis
      const analysisResult = await performCodeAnalysis(code, sanitizedFilePath);
      
      // Store analysis result
      const { data, error } = await supabase
        .from('quality_analyses')
        .insert({
          user_id: req.user.id,
          project_name: project_name || 'Unknown',
          file_path: sanitizedFilePath,
          quality_score: analysisResult.qualityScore,
          bug_risk: analysisResult.bugRisk,
          maintainability_score: analysisResult.maintainability,
          performance_score: analysisResult.performance,
          complexity_score: analysisResult.complexity,
          issues_detected: analysisResult.issues,
          recommendations: analysisResult.recommendations
        })
        .select()
        .single();

      if (error) {
        console.error('Error storing analysis:', error);
      }

      res.json({
        ...analysisResult,
        analysis_id: data?.id,
        usage: req.usage
      });

    } catch (rateLimitError) {
      res.status(429).json({
        error: 'Analysis rate limit exceeded',
        code: 'ANALYSIS_RATE_LIMIT',
        retry_after: Math.round(rateLimitError.msBeforeNext / 1000)
      });
    } catch (error) {
      console.error('Analysis error:', error);
      res.status(500).json({
        error: 'Analysis failed',
        code: 'ANALYSIS_ERROR'
      });
    }
  }
);

// Subscription management
app.post('/api/v1/subscription/create',
  authenticateToken,
  requireCSRF,
  async (req, res) => {
    try {
      const { plan_id, billing_cycle } = req.body;

      // Server-side price validation
      const { data: planDetails } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', plan_id)
        .eq('is_active', true)
        .single();

      if (!planDetails) {
        return res.status(400).json({
          error: 'Invalid subscription plan',
          code: 'INVALID_PLAN'
        });
      }

      // Calculate correct price based on billing cycle
      const amount = billing_cycle === 'yearly' 
        ? planDetails.price_yearly * 100 // Convert to cents
        : planDetails.price_monthly * 100;

      // Create Stripe payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        metadata: {
          user_id: req.user.id,
          plan_id: plan_id,
          billing_cycle: billing_cycle
        }
      });

      res.json({
        client_secret: paymentIntent.client_secret,
        plan: planDetails,
        amount: amount / 100
      });

    } catch (error) {
      console.error('Subscription creation error:', error);
      res.status(500).json({
        error: 'Failed to create subscription',
        code: 'SUBSCRIPTION_ERROR'
      });
    }
  }
);

// Stripe webhooks
app.post('/api/v1/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const sig = req.headers['stripe-signature'];
      let event;

      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      // Handle different event types
      switch (event.type) {
        case 'payment_intent.succeeded':
          await handlePaymentSuccess(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await handlePaymentFailed(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          await handleSubscriptionRenewal(event.data.object);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

// Helper functions
async function performCodeAnalysis(code, filePath) {
  // Simulate code analysis (in production, this would use the ML models)
  const lines = code.split('\n');
  const linesOfCode = lines.filter(line => line.trim().length > 0).length;
  
  // Basic complexity calculation
  const complexityIndicators = (code.match(/if\s*\(|for\s*\(|while\s*\(|switch\s*\(/g) || []).length;
  const complexity = Math.min(10, complexityIndicators / 10);
  
  // Duplicate line detection
  const duplicateLines = findDuplicateLines(lines);
  
  // Quality scoring
  const qualityScore = Math.max(0, Math.min(100, 
    100 - (complexity * 10) - (duplicateLines * 5)
  ));
  
  const bugRisk = Math.min(100, complexity * 15 + duplicateLines * 3);
  const maintainability = Math.max(1, Math.min(10, 10 - (complexity * 2)));
  const performance = Math.max(1, Math.min(10, 10 - (complexity * 1.5)));
  
  return {
    qualityScore: Math.round(qualityScore),
    bugRisk,
    maintainability,
    performance,
    complexity,
    linesOfCode,
    issues: [
      ...(duplicateLines > 0 ? ['Code duplication detected'] : []),
      ...(complexity > 5 ? ['High complexity detected'] : [])
    ],
    recommendations: [
      'Keep functions under 20 lines',
      'Avoid code duplication',
      'Use consistent naming conventions'
    ]
  };
}

function findDuplicateLines(lines) {
  const lineMap = new Map();
  let duplicates = 0;
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.length > 10) {
      const count = lineMap.get(trimmed) || 0;
      lineMap.set(trimmed, count + 1);
      if (count === 1) duplicates++;
    }
  });
  
  return duplicates;
}

async function handlePaymentSuccess(paymentIntent) {
  const { user_id, plan_id, billing_cycle } = paymentIntent.metadata;
  
  // Create or update subscription
  const subscriptionEndDate = new Date();
  if (billing_cycle === 'yearly') {
    subscriptionEndDate.setFullYear(subscriptionEndDate.getFullYear() + 1);
  } else {
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
  }

  const { error } = await supabase
    .from('user_subscriptions')
    .upsert({
      user_id,
      plan_id,
      stripe_subscription_id: paymentIntent.id,
      status: 'active',
      billing_cycle,
      current_period_start: new Date().toISOString(),
      current_period_end: subscriptionEndDate.toISOString()
    });

  if (error) {
    console.error('Error creating subscription:', error);
  }
}

async function handlePaymentFailed(paymentIntent) {
  // Handle failed payments (send notifications, update subscription status)
  console.log('Payment failed for:', paymentIntent.metadata.user_id);
}

async function handleSubscriptionRenewal(invoice) {
  // Handle subscription renewal
  console.log('Subscription renewed:', invoice);
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(isDevelopment && { details: error.message, stack: error.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.path
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Code Quality Predictor API running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 CORS enabled for: ${allowedOrigins.join(', ')}`);
});

export default app;