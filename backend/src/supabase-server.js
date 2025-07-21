import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import bcrypt from 'bcrypt';
import Stripe from 'stripe';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  full_name: Joi.string().required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const analysisSchema = Joi.object({
  code: Joi.string().required(),
  file_path: Joi.string().required(),
  project_name: Joi.string().required()
});

// Authentication middleware
export const authenticateUser = async (token) => {
  try {
    if (!token) throw new Error('No token provided');
    
    const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
    
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', decoded.sub)
      .single();
      
    if (error || !profile) throw new Error('Invalid token');
    
    return profile;
  } catch (error) {
    throw new Error('Authentication failed');
  }
};

// Check subscription limits
export const checkUsageLimit = async (userId) => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  
  // Get user subscription
  const { data: subscription, error: subError } = await supabase
    .from('user_subscriptions')
    .select(`
      *,
      subscription_plans(*)
    `)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();
    
  if (subError) {
    // Default to free plan
    const limit = 20;
    const { data: usage } = await supabase
      .from('usage_tracking')
      .select('analyses_used')
      .eq('user_id', userId)
      .eq('month_year', currentMonth)
      .single();
      
    return {
      canAnalyze: !usage || usage.analyses_used < limit,
      usage: usage?.analyses_used || 0,
      limit
    };
  }
  
  const limit = subscription.subscription_plans.analysis_limit;
  
  const { data: usage } = await supabase
    .from('usage_tracking')
    .select('analyses_used')
    .eq('user_id', userId)
    .eq('month_year', currentMonth)
    .single();
    
  return {
    canAnalyze: limit === -1 || !usage || usage.analyses_used < limit,
    usage: usage?.analyses_used || 0,
    limit
  };
};

// Update usage tracking
export const updateUsage = async (userId) => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  
  const { error } = await supabase.rpc('increment_usage', {
    p_user_id: userId,
    p_month_year: currentMonth
  });
  
  if (error) console.error('Failed to update usage:', error);
};

// Code analysis engine
export const analyzeCode = (code) => {
  const lines = code.split('\n');
  const totalLines = lines.length;
  const nonEmptyLines = lines.filter(line => line.trim()).length;
  
  // Calculate complexity
  const complexityPatterns = [
    /\bif\b/g, /\belse\b/g, /\bfor\b/g, /\bwhile\b/g,
    /\bswitch\b/g, /\bcatch\b/g, /\btry\b/g
  ];
  
  let complexity = 0;
  complexityPatterns.forEach(pattern => {
    const matches = code.match(pattern);
    complexity += matches ? matches.length : 0;
  });
  
  // Find long functions
  const functionMatches = code.match(/function\s+\w+\s*\([^)]*\)\s*\{[^}]{200,}\}/g);
  const longFunctions = functionMatches ? functionMatches.length : 0;
  
  // Detect duplicate code patterns
  const duplicatePatterns = [];
  const lineGroups = {};
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed && trimmed.length > 10) {
      if (!lineGroups[trimmed]) lineGroups[trimmed] = [];
      lineGroups[trimmed].push(index + 1);
    }
  });
  
  const duplicateLines = Object.values(lineGroups)
    .filter(group => group.length > 1)
    .reduce((sum, group) => sum + group.length - 1, 0);
    
  // Calculate maintainability score
  const qualityScore = Math.max(0, Math.min(100, 
    100 - (complexity * 8) - (duplicateLines * 3) - (longFunctions * 12)
  ));
  
  // Generate issues and suggestions
  const issues = [];
  const suggestions = [];
  
  if (complexity > 10) {
    issues.push({
      type: 'high_complexity',
      severity: 'warning',
      message: `High cyclomatic complexity (${complexity}). Consider breaking down complex functions.`,
      line: null
    });
    suggestions.push('Extract complex logic into smaller, focused functions');
  }
  
  if (longFunctions > 0) {
    issues.push({
      type: 'long_function',
      severity: 'warning',
      message: `${longFunctions} function(s) exceed recommended length. Consider refactoring.`,
      line: null
    });
    suggestions.push('Break long functions into smaller, single-purpose functions');
  }
  
  if (duplicateLines > 5) {
    issues.push({
      type: 'code_duplication',
      severity: 'info',
      message: `${duplicateLines} duplicate lines detected. Consider extracting common code.`,
      line: null
    });
    suggestions.push('Extract duplicate code into reusable functions or constants');
  }
  
  return {
    qualityScore,
    metrics: {
      totalLines,
      nonEmptyLines,
      complexity,
      longFunctions,
      duplicateLines
    },
    issues,
    suggestions,
    grade: qualityScore >= 80 ? 'A' : qualityScore >= 60 ? 'B' : qualityScore >= 40 ? 'C' : 'D'
  };
};

// API handlers
export const handlers = {
  // Authentication
  register: async (event) => {
    try {
      const body = JSON.parse(event.body);
      const { error: validationError } = registerSchema.validate(body);
      if (validationError) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: validationError.details[0].message })
        };
      }

      const { email, password, full_name } = body;
      
      // Check if user exists
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();
        
      if (existingUser) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'User already exists' })
        };
      }
      
      // Create auth user
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      
      if (authError) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: authError.message })
        };
      }
      
      // Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authUser.user.id,
          email,
          full_name,
          created_at: new Date().toISOString()
        });
        
      if (profileError) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to create profile' })
        };
      }
      
      // Generate JWT
      const token = jwt.sign(
        { sub: authUser.user.id, email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      return {
        statusCode: 201,
        body: JSON.stringify({
          message: 'User registered successfully',
          token,
          user: { id: authUser.user.id, email, full_name }
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal server error' })
      };
    }
  },

  login: async (event) => {
    try {
      const body = JSON.parse(event.body);
      const { error: validationError } = loginSchema.validate(body);
      if (validationError) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: validationError.details[0].message })
        };
      }

      const { email, password } = body;
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: 'Invalid credentials' })
        };
      }
      
      const token = jwt.sign(
        { sub: data.user.id, email: data.user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Login successful',
          token,
          user: { id: data.user.id, email: data.user.email }
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal server error' })
      };
    }
  },

  // Code analysis
  analyze: async (event) => {
    try {
      const user = await authenticateUser(event.headers.authorization);
      
      const body = JSON.parse(event.body);
      const { error: validationError } = analysisSchema.validate(body);
      if (validationError) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: validationError.details[0].message })
        };
      }
      
      // Check usage limits
      const usageCheck = await checkUsageLimit(user.id);
      if (!usageCheck.canAnalyze) {
        return {
          statusCode: 429,
          body: JSON.stringify({ 
            error: 'Usage limit exceeded',
            usage: usageCheck.usage,
            limit: usageCheck.limit
          })
        };
      }
      
      const { code, file_path, project_name } = body;
      
      // Perform analysis
      const analysis = analyzeCode(code);
      
      // Save analysis to database
      const { data: savedAnalysis, error: saveError } = await supabase
        .from('quality_analyses')
        .insert({
          user_id: user.id,
          file_path,
          project_name,
          quality_score: analysis.qualityScore,
          metrics: analysis.metrics,
          issues: analysis.issues,
          suggestions: analysis.suggestions,
          grade: analysis.grade
        })
        .select()
        .single();
        
      if (saveError) {
        console.error('Failed to save analysis:', saveError);
      }
      
      // Update usage
      await updateUsage(user.id);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          analysis_id: savedAnalysis?.id,
          ...analysis
        })
      };
    } catch (error) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: error.message })
      };
    }
  },

  // Get analysis history
  history: async (event) => {
    try {
      const user = await authenticateUser(event.headers.authorization);
      
      const page = parseInt(event.queryStringParameters?.page) || 1;
      const limit = parseInt(event.queryStringParameters?.limit) || 20;
      const offset = (page - 1) * limit;
      
      const { data, error } = await supabase
        .from('quality_analyses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
        
      if (error) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to fetch history' })
        };
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          analyses: data,
          page,
          limit
        })
      };
    } catch (error) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: error.message })
      };
    }
  },

  // Get subscription plans
  plans: async (event) => {
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price');
        
      if (error) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to fetch plans' })
        };
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({ plans: data })
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal server error' })
      };
    }
  },

  // Create subscription
  createSubscription: async (event) => {
    try {
      const user = await authenticateUser(event.headers.authorization);
      
      const body = JSON.parse(event.body);
      const { plan_id, billing_cycle = 'monthly' } = body;
      
      // Get plan details
      const { data: plan, error: planError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', plan_id)
        .single();
        
      if (planError || !plan) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Plan not found' })
        };
      }
      
      // Create Stripe customer if not exists
      let customerId;
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .single();
        
      if (profile?.stripe_customer_id) {
        customerId = profile.stripe_customer_id;
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.full_name
        });
        customerId = customer.id;
        
        await supabase
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', user.id);
      }
      
      // Create Stripe subscription
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: plan.stripe_price_id }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent']
      });
      
      // Save subscription to database
      await supabase
        .from('user_subscriptions')
        .insert({
          user_id: user.id,
          plan_id,
          stripe_subscription_id: subscription.id,
          status: 'incomplete',
          billing_cycle
        });
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          subscription_id: subscription.id,
          client_secret: subscription.latest_invoice.payment_intent.client_secret
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }
  },

  // Stripe webhooks
  stripeWebhook: async (event) => {
    try {
      const signature = event.headers['stripe-signature'];
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      
      let stripeEvent;
      try {
        stripeEvent = stripe.webhooks.constructEvent(event.body, signature, webhookSecret);
      } catch (err) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid signature' })
        };
      }
      
      switch (stripeEvent.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = stripeEvent.data.object;
          await supabase
            .from('user_subscriptions')
            .update({ status: 'active' })
            .eq('stripe_subscription_id', paymentIntent.invoice.subscription);
          break;
          
        case 'customer.subscription.deleted':
          const subscription = stripeEvent.data.object;
          await supabase
            .from('user_subscriptions')
            .update({ status: 'cancelled' })
            .eq('stripe_subscription_id', subscription.id);
          break;
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({ received: true })
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Webhook processing failed' })
      };
    }
  },

  // Health check
  health: async (event) => {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: 'netlify'
      })
    };
  }
};