import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import Joi from 'joi';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import Stripe from 'stripe';
import { query, transaction, initializeDatabase } from './database/connection.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Stripe (use test keys for development)
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
  auth: new RateLimiterMemory({
    keyPrefix: 'rl_auth',
    points: 5,
    duration: 900, // 15 minutes
    blockDuration: 3600 // 1 hour
  }),
  
  api: new RateLimiterMemory({
    keyPrefix: 'rl_api',
    points: 100,
    duration: 900, // 15 minutes
    blockDuration: 60 // 1 minute
  }),

  analysis: new RateLimiterMemory({
    keyPrefix: 'rl_analysis',
    points: 10,
    duration: 60, // 1 minute
    blockDuration: 300 // 5 minutes
  })
};

// Validation schemas
const schemas = {
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    full_name: Joi.string().min(2).max(100).optional(),
    company: Joi.string().max(100).optional()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  analysis: Joi.object({
    code: Joi.string().max(1024 * 1024).required(), // 1MB max
    file_path: Joi.string().pattern(/^[a-zA-Z0-9\-_\/\.]+$/).max(500).required(),
    project_name: Joi.string().alphanum().max(100).optional()
  }),

  subscription: Joi.object({
    plan_id: Joi.string().valid('free', 'pro', 'team').required(),
    billing_cycle: Joi.string().valid('monthly', 'yearly').required()
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
    
    // Get user from database with subscription info
    const result = await query(`
      SELECT 
        p.*,
        s.id as subscription_id,
        s.plan_id,
        s.status as subscription_status,
        s.current_period_end,
        sp.analysis_limit,
        sp.features
      FROM profiles p
      LEFT JOIN user_subscriptions s ON p.id = s.user_id 
        AND s.status = 'active' 
        AND s.current_period_end > NOW()
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE p.id = $1
    `, [decoded.sub]);

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    req.user = result.rows[0];
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
    
    // Use the database function to check and increment usage
    const result = await query('SELECT check_usage_limit($1, $2)', [userId, 1]);
    const usageData = result.rows[0].check_usage_limit;

    if (!usageData.allowed) {
      return res.status(429).json({
        error: 'Usage limit exceeded',
        code: 'USAGE_LIMIT_EXCEEDED',
        current_usage: usageData.current_usage,
        limit: usageData.limit,
        remaining: usageData.remaining,
        plan_id: usageData.plan_id,
        upgrade_url: '/subscription/upgrade'
      });
    }

    req.usage = usageData;
    next();
  } catch (error) {
    console.error('Usage limit check failed:', error);
    res.status(500).json({ 
      error: 'Usage verification failed',
      code: 'USAGE_ERROR'
    });
  }
};

// Input validation middleware
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input',
        code: 'VALIDATION_ERROR',
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
    version: process.env.npm_package_version || '1.0.0',
    database: 'connected'
  });
});

// User registration
app.post('/api/v1/auth/register', validate(schemas.register), async (req, res) => {
  try {
    await rateLimiters.auth.consume(req.ip);
    
    const { email, password, full_name, company } = req.validatedBody;

    // Check if user already exists
    const existingUser = await query('SELECT id FROM auth_users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ 
        error: 'User already exists',
        code: 'USER_EXISTS'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user in transaction
    const result = await transaction(async (client) => {
      // Create auth user
      const authResult = await client.query(
        'INSERT INTO auth_users (email, password_hash, email_confirmed) VALUES ($1, $2, $3) RETURNING id',
        [email, passwordHash, true] // Auto-confirm for development
      );

      const userId = authResult.rows[0].id;

      // Create profile
      await client.query(
        'INSERT INTO profiles (id, email, full_name, company) VALUES ($1, $2, $3, $4)',
        [userId, email, full_name, company]
      );

      // Create default free subscription
      await client.query(
        'INSERT INTO user_subscriptions (user_id, plan_id, status) VALUES ($1, $2, $3)',
        [userId, 'free', 'active']
      );

      return userId;
    });

    // Generate JWT token
    const token = jwt.sign(
      { 
        sub: result,
        email: email,
        iat: Math.floor(Date.now() / 1000)
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: '24h',
        issuer: 'code-quality-predictor',
        audience: 'api.code-quality-predictor.com'
      }
    );

    res.status(201).json({
      message: 'User created successfully',
      access_token: token,
      token_type: 'Bearer',
      expires_in: 86400,
      user: {
        id: result,
        email: email,
        full_name: full_name
      }
    });

  } catch (rateLimitError) {
    if (rateLimitError.remainingHits !== undefined) {
      return res.status(429).json({
        error: 'Too many registration attempts',
        code: 'RATE_LIMIT_EXCEEDED',
        retry_after: Math.round(rateLimitError.msBeforeNext / 1000)
      });
    }
    console.error('Registration error:', rateLimitError);
    res.status(500).json({
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR'
    });
  }
});

// User login
app.post('/api/v1/auth/login', validate(schemas.login), async (req, res) => {
  try {
    await rateLimiters.auth.consume(req.ip);
    
    const { email, password } = req.validatedBody;

    // Get user with password hash
    const userResult = await query(`
      SELECT au.id, au.email, au.password_hash, p.full_name, p.company 
      FROM auth_users au 
      JOIN profiles p ON au.id = p.id 
      WHERE au.email = $1
    `, [email]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const user = userResult.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        sub: user.id,
        email: user.email,
        iat: Math.floor(Date.now() / 1000)
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: '24h',
        issuer: 'code-quality-predictor',
        audience: 'api.code-quality-predictor.com'
      }
    );

    res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 86400,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        company: user.company
      }
    });

  } catch (rateLimitError) {
    if (rateLimitError.remainingHits !== undefined) {
      return res.status(429).json({
        error: 'Too many login attempts',
        code: 'RATE_LIMIT_EXCEEDED',
        retry_after: Math.round(rateLimitError.msBeforeNext / 1000)
      });
    }
    console.error('Login error:', rateLimitError);
    res.status(500).json({
      error: 'Login failed',
      code: 'LOGIN_ERROR'
    });
  }
});

// Get user profile
app.get('/api/v1/user/profile', authenticateToken, async (req, res) => {
  try {
    const result = await query('SELECT get_user_with_subscription($1)', [req.user.id]);
    const userData = result.rows[0].get_user_with_subscription;
    
    res.json(userData);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch profile',
      code: 'PROFILE_ERROR'
    });
  }
});

// Code analysis endpoint
app.post('/api/v1/analysis/analyze', 
  authenticateToken,
  checkUsageLimit,
  validate(schemas.analysis),
  async (req, res) => {
    try {
      await rateLimiters.analysis.consume(`${req.user.id}:analysis`);

      const { code, file_path, project_name } = req.validatedBody;

      // Perform code analysis
      const analysisResult = await performCodeAnalysis(code, file_path);
      
      // Store analysis result
      const result = await query(`
        INSERT INTO quality_analyses (
          user_id, project_name, file_path, quality_score, bug_risk,
          maintainability_score, performance_score, complexity_score,
          issues_detected, recommendations, analysis_metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, created_at
      `, [
        req.user.id,
        project_name || 'Unknown',
        file_path,
        analysisResult.qualityScore,
        analysisResult.bugRisk,
        analysisResult.maintainability,
        analysisResult.performance,
        analysisResult.complexity,
        JSON.stringify(analysisResult.issues),
        JSON.stringify(analysisResult.recommendations),
        JSON.stringify({ version: '1.0', model: 'basic' })
      ]);

      res.json({
        ...analysisResult,
        analysis_id: result.rows[0].id,
        created_at: result.rows[0].created_at,
        usage: req.usage
      });

    } catch (rateLimitError) {
      if (rateLimitError.remainingHits !== undefined) {
        return res.status(429).json({
          error: 'Analysis rate limit exceeded',
          code: 'ANALYSIS_RATE_LIMIT',
          retry_after: Math.round(rateLimitError.msBeforeNext / 1000)
        });
      }
      console.error('Analysis error:', rateLimitError);
      res.status(500).json({
        error: 'Analysis failed',
        code: 'ANALYSIS_ERROR'
      });
    }
  }
);

// Get user's analysis history
app.get('/api/v1/analysis/history', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = await query(`
      SELECT 
        id, project_name, file_path, quality_score, bug_risk,
        maintainability_score, performance_score, complexity_score,
        created_at
      FROM quality_analyses 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

    const countResult = await query(
      'SELECT COUNT(*) FROM quality_analyses WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      analyses: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        total_pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
      }
    });

  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch analysis history',
      code: 'HISTORY_ERROR'
    });
  }
});

// Get subscription plans
app.get('/api/v1/subscription/plans', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM subscription_plans WHERE is_active = true ORDER BY price_monthly ASC'
    );
    
    res.json({
      plans: result.rows
    });
  } catch (error) {
    console.error('Plans fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch plans',
      code: 'PLANS_ERROR'
    });
  }
});

// Create subscription payment intent
app.post('/api/v1/subscription/create', 
  authenticateToken, 
  validate(schemas.subscription),
  async (req, res) => {
    try {
      const { plan_id, billing_cycle } = req.validatedBody;

      // Get plan details for price validation
      const planResult = await query(
        'SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true',
        [plan_id]
      );

      if (planResult.rows.length === 0) {
        return res.status(400).json({
          error: 'Invalid subscription plan',
          code: 'INVALID_PLAN'
        });
      }

      const plan = planResult.rows[0];
      const amount = billing_cycle === 'yearly' 
        ? Math.round(plan.price_yearly * 100) // Convert to cents
        : Math.round(plan.price_monthly * 100);

      if (amount === 0) {
        // Free plan - just update subscription
        await query(`
          INSERT INTO user_subscriptions (user_id, plan_id, status, billing_cycle)
          VALUES ($1, $2, 'active', $3)
          ON CONFLICT (user_id) DO UPDATE SET
            plan_id = $2, status = 'active', billing_cycle = $3,
            current_period_start = NOW(),
            current_period_end = NOW() + INTERVAL '1 month',
            updated_at = NOW()
        `, [req.user.id, plan_id, billing_cycle]);

        return res.json({
          message: 'Free plan activated',
          plan: plan
        });
      }

      // Create Stripe payment intent for paid plans
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
        plan: plan,
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

// Helper functions
async function performCodeAnalysis(code, filePath) {
  // Enhanced code analysis logic
  const lines = code.split('\n');
  const linesOfCode = lines.filter(line => line.trim().length > 0).length;
  
  // Complexity analysis
  const complexityPatterns = {
    'if': /\bif\s*\(/g,
    'for': /\bfor\s*\(/g,
    'while': /\bwhile\s*\(/g,
    'switch': /\bswitch\s*\(/g,
    'catch': /\bcatch\s*\(/g,
    'ternary': /\?\s*.*?\s*:/g
  };
  
  let complexity = 1;
  for (const [pattern, regex] of Object.entries(complexityPatterns)) {
    const matches = code.match(regex) || [];
    complexity += matches.length;
  }
  
  complexity = Math.min(10, complexity / 10);
  
  // Duplicate line detection
  const duplicateLines = findDuplicateLines(lines);
  
  // Long function detection
  const longFunctions = findLongFunctions(code, filePath.split('.').pop() || '');
  
  // Quality scoring
  const qualityScore = Math.max(0, Math.min(100, 
    100 - (complexity * 10) - (duplicateLines * 5) - (longFunctions * 15)
  ));
  
  const bugRisk = Math.min(100, complexity * 15 + duplicateLines * 3 + longFunctions * 20);
  const maintainability = Math.max(1, Math.min(10, 10 - (complexity * 2)));
  const performance = Math.max(1, Math.min(10, 10 - (longFunctions * 3)));
  
  return {
    qualityScore: Math.round(qualityScore),
    bugRisk: Math.round(bugRisk * 100) / 100,
    maintainability: Math.round(maintainability),
    performance: Math.round(performance),
    complexity: Math.round(complexity * 100) / 100,
    linesOfCode,
    issues: [
      ...(duplicateLines > 0 ? ['Code duplication detected'] : []),
      ...(longFunctions > 0 ? ['Long functions found'] : []),
      ...(complexity > 5 ? ['High complexity detected'] : [])
    ],
    recommendations: generateRecommendations(complexity, duplicateLines, longFunctions)
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

function findLongFunctions(code, extension) {
  const functionPatterns = {
    'js': /function\s+\w+\s*\([^)]*\)\s*{[^}]*}/g,
    'ts': /(function\s+\w+|\w+\s*:\s*\([^)]*\)\s*=>)[^}]*}/g,
    'py': /def\s+\w+\s*\([^)]*\):[^\n]*(?:\n(?:\s{4,}[^\n]*|\s*\n))*\n?/g
  };
  
  const pattern = functionPatterns[extension];
  if (!pattern) return 0;
  
  const functions = code.match(pattern) || [];
  return functions.filter(func => func.split('\n').length > 20).length;
}

function generateRecommendations(complexity, duplicateLines, longFunctions) {
  const recommendations = [];
  
  if (complexity > 5) {
    recommendations.push('Reduce cyclomatic complexity by breaking down large functions');
  }
  
  if (duplicateLines > 0) {
    recommendations.push('Eliminate code duplication by extracting common functionality');
  }
  
  if (longFunctions > 0) {
    recommendations.push('Split long functions into smaller, more focused methods');
  }
  
  recommendations.push('Add comprehensive unit tests');
  recommendations.push('Use consistent naming conventions');
  recommendations.push('Consider adding documentation for complex logic');
  
  return recommendations;
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
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

// Initialize and start server
const startServer = async () => {
  try {
    // Initialize database
    const dbInitialized = await initializeDatabase();
    if (!dbInitialized) {
      console.error('❌ Failed to initialize database');
      process.exit(1);
    }

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Code Quality Predictor API running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔒 CORS enabled for: ${allowedOrigins.join(', ')}`);
      console.log(`🗄️  Database: PostgreSQL (local)`);
      console.log(`📈 PgAdmin: http://localhost:5050 (admin@codequalitypredictor.com / admin123)`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;