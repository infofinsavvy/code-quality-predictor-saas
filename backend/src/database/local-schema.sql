-- Local PostgreSQL Database Schema for Code Quality Predictor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (simulating auth.users from Supabase)
CREATE TABLE auth_users (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  email varchar UNIQUE NOT NULL,
  password_hash varchar NOT NULL,
  email_confirmed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Profiles table
CREATE TABLE profiles (
  id uuid REFERENCES auth_users(id) ON DELETE CASCADE PRIMARY KEY,
  email varchar NOT NULL,
  full_name varchar,
  avatar_url varchar,
  company varchar,
  role varchar DEFAULT 'user',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Subscription plans
CREATE TABLE subscription_plans (
  id varchar PRIMARY KEY,
  name varchar NOT NULL,
  price_monthly numeric(10,2) NOT NULL,
  price_yearly numeric(10,2) NOT NULL,
  analysis_limit integer NOT NULL,
  features jsonb NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- User subscriptions
CREATE TABLE user_subscriptions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  plan_id varchar REFERENCES subscription_plans(id) NOT NULL,
  stripe_subscription_id varchar UNIQUE,
  stripe_customer_id varchar,
  status varchar NOT NULL DEFAULT 'inactive',
  billing_cycle varchar NOT NULL DEFAULT 'monthly',
  current_period_start timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  current_period_end timestamp with time zone DEFAULT timezone('utc'::text, now()) + interval '1 month' NOT NULL,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Usage tracking
CREATE TABLE usage_tracking (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  month_year varchar NOT NULL,
  analyses_used integer DEFAULT 0,
  api_calls integer DEFAULT 0,
  last_reset_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, month_year)
);

-- Code quality analyses
CREATE TABLE quality_analyses (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  project_name varchar,
  file_path varchar NOT NULL,
  quality_score integer NOT NULL,
  bug_risk numeric(5,2) NOT NULL,
  maintainability_score integer NOT NULL,
  performance_score integer NOT NULL,
  complexity_score numeric(5,2) NOT NULL,
  issues_detected jsonb,
  recommendations jsonb,
  analysis_metadata jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- API keys for extension authentication
CREATE TABLE api_keys (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  key_hash varchar NOT NULL,
  key_prefix varchar NOT NULL,
  name varchar NOT NULL,
  last_used_at timestamp with time zone,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  expires_at timestamp with time zone
);

-- Teams
CREATE TABLE teams (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name varchar NOT NULL,
  slug varchar UNIQUE NOT NULL,
  owner_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  subscription_id uuid REFERENCES user_subscriptions(id),
  settings jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Team members
CREATE TABLE team_members (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role varchar NOT NULL DEFAULT 'member',
  invited_by uuid REFERENCES profiles(id),
  joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(team_id, user_id)
);

-- Session storage (for JWT refresh tokens)
CREATE TABLE user_sessions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  refresh_token_hash varchar NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  user_agent varchar,
  ip_address inet
);

-- Insert default subscription plans
INSERT INTO subscription_plans (id, name, price_monthly, price_yearly, analysis_limit, features) VALUES
('free', 'Free', 0.00, 0.00, 20, '{
  "basic_analysis": true,
  "quality_scoring": true,
  "simple_recommendations": true,
  "projects": 1,
  "export_reports": 1
}'),
('pro', 'Pro', 12.99, 129.90, 1000, '{
  "basic_analysis": true,
  "quality_scoring": true,
  "ai_predictions": true,
  "advanced_ml": true,
  "team_collaboration": true,
  "projects": "unlimited",
  "export_reports": "unlimited",
  "integrations": ["github", "gitlab"],
  "priority_support": true
}'),
('team', 'Team', 39.99, 399.90, -1, '{
  "basic_analysis": true,
  "quality_scoring": true,
  "ai_predictions": true,
  "advanced_ml": true,
  "team_collaboration": true,
  "team_dashboard": true,
  "projects": "unlimited",
  "export_reports": "unlimited",
  "integrations": ["github", "gitlab", "slack", "teams"],
  "api_access": true,
  "admin_controls": true,
  "custom_rules": true,
  "priority_support": true,
  "users": 10
}');

-- Indexes for performance
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_usage_tracking_user_month ON usage_tracking(user_id, month_year);
CREATE INDEX idx_quality_analyses_user_id ON quality_analyses(user_id);
CREATE INDEX idx_quality_analyses_created_at ON quality_analyses(created_at);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_subscriptions_updated_at BEFORE UPDATE ON user_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_usage_tracking_updated_at BEFORE UPDATE ON usage_tracking FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check usage limits
CREATE OR REPLACE FUNCTION check_usage_limit(p_user_id uuid, p_increment integer DEFAULT 1)
RETURNS jsonb AS $$
DECLARE
  v_current_month varchar := to_char(now(), 'YYYY-MM');
  v_subscription record;
  v_usage record;
  v_limit integer;
  v_current_usage integer;
BEGIN
  -- Get user's current subscription
  SELECT s.*, p.analysis_limit 
  INTO v_subscription
  FROM user_subscriptions s
  JOIN subscription_plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id 
    AND s.status = 'active'
    AND s.current_period_end > now()
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- If no active subscription, use free plan limits
  IF v_subscription IS NULL THEN
    SELECT analysis_limit INTO v_limit
    FROM subscription_plans 
    WHERE id = 'free';
  ELSE
    v_limit := v_subscription.analysis_limit;
  END IF;

  -- Get current usage
  SELECT analyses_used INTO v_current_usage
  FROM usage_tracking
  WHERE user_id = p_user_id AND month_year = v_current_month;

  IF v_current_usage IS NULL THEN
    v_current_usage := 0;
  END IF;

  -- Check if user would exceed limit (-1 means unlimited)
  IF v_limit > 0 AND (v_current_usage + p_increment) > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'current_usage', v_current_usage,
      'limit', v_limit,
      'remaining', v_limit - v_current_usage,
      'plan_id', COALESCE(v_subscription.plan_id, 'free')
    );
  END IF;

  -- Update usage
  INSERT INTO usage_tracking (user_id, month_year, analyses_used, updated_at)
  VALUES (p_user_id, v_current_month, p_increment, now())
  ON CONFLICT (user_id, month_year)
  DO UPDATE SET 
    analyses_used = usage_tracking.analyses_used + p_increment,
    updated_at = now();

  RETURN jsonb_build_object(
    'allowed', true,
    'current_usage', v_current_usage + p_increment,
    'limit', v_limit,
    'remaining', CASE WHEN v_limit = -1 THEN -1 ELSE v_limit - (v_current_usage + p_increment) END,
    'plan_id', COALESCE(v_subscription.plan_id, 'free')
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get user with subscription info
CREATE OR REPLACE FUNCTION get_user_with_subscription(p_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'company', p.company,
    'role', p.role,
    'created_at', p.created_at,
    'subscription', CASE 
      WHEN s.id IS NOT NULL THEN jsonb_build_object(
        'id', s.id,
        'plan_id', s.plan_id,
        'status', s.status,
        'billing_cycle', s.billing_cycle,
        'current_period_start', s.current_period_start,
        'current_period_end', s.current_period_end,
        'plan', sp.*
      )
      ELSE NULL
    END
  ) INTO v_result
  FROM profiles p
  LEFT JOIN user_subscriptions s ON p.id = s.user_id AND s.status = 'active'
  LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE p.id = p_user_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Create default admin user for testing
DO $$
DECLARE
  admin_user_id uuid;
BEGIN
  -- Insert admin user
  INSERT INTO auth_users (id, email, password_hash, email_confirmed)
  VALUES (uuid_generate_v4(), 'admin@codequalitypredictor.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/lewNCiS5YvWCixrVa', true)
  RETURNING id INTO admin_user_id;

  -- Insert admin profile
  INSERT INTO profiles (id, email, full_name, company, role)
  VALUES (admin_user_id, 'admin@codequalitypredictor.com', 'Admin User', 'Code Quality Predictor', 'admin');

  -- Give admin a pro subscription
  INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_end)
  VALUES (admin_user_id, 'pro', 'active', now() + interval '1 year');

  RAISE NOTICE 'Admin user created with ID: %', admin_user_id;
END $$;