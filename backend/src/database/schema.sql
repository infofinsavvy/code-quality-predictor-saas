-- Code Quality Predictor Database Schema for Supabase

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users(id) PRIMARY KEY,
  email varchar NOT NULL,
  full_name varchar,
  avatar_url varchar,
  company varchar,
  stripe_customer_id varchar,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Subscription plans
CREATE TABLE public.subscription_plans (
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
CREATE TABLE public.user_subscriptions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  plan_id varchar REFERENCES public.subscription_plans(id) NOT NULL,
  stripe_subscription_id varchar UNIQUE,
  stripe_customer_id varchar,
  status varchar NOT NULL, -- active, inactive, canceled, past_due
  billing_cycle varchar NOT NULL, -- monthly, yearly
  current_period_start timestamp with time zone NOT NULL,
  current_period_end timestamp with time zone NOT NULL,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Usage tracking
CREATE TABLE public.usage_tracking (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  month_year varchar NOT NULL, -- '2024-01'
  analyses_used integer DEFAULT 0,
  api_calls integer DEFAULT 0,
  last_reset_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, month_year)
);

-- Code quality analytics storage
CREATE TABLE public.quality_analyses (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  project_name varchar,
  file_path varchar NOT NULL,
  quality_score integer NOT NULL,
  metrics jsonb NOT NULL,
  issues jsonb,
  suggestions jsonb,
  grade varchar NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- API keys for extension authentication
CREATE TABLE public.api_keys (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  key_hash varchar NOT NULL,
  key_prefix varchar NOT NULL,
  name varchar NOT NULL,
  last_used_at timestamp with time zone,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  expires_at timestamp with time zone
);

-- Team management
CREATE TABLE public.teams (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name varchar NOT NULL,
  slug varchar UNIQUE NOT NULL,
  owner_id uuid REFERENCES public.profiles(id) NOT NULL,
  subscription_id uuid REFERENCES public.user_subscriptions(id),
  settings jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Team members
CREATE TABLE public.team_members (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  team_id uuid REFERENCES public.teams(id) NOT NULL,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  role varchar NOT NULL, -- owner, admin, member
  invited_by uuid REFERENCES public.profiles(id),
  joined_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(team_id, user_id)
);

-- Insert default subscription plans
INSERT INTO public.subscription_plans (id, name, price_monthly, price_yearly, analysis_limit, features) VALUES
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

-- Row Level Security (RLS) policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Subscriptions policies
CREATE POLICY "Users can view own subscription" ON public.user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Usage tracking policies
CREATE POLICY "Users can view own usage" ON public.usage_tracking
  FOR SELECT USING (auth.uid() = user_id);

-- Quality analyses policies
CREATE POLICY "Users can view own analyses" ON public.quality_analyses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analyses" ON public.quality_analyses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- API keys policies
CREATE POLICY "Users can manage own API keys" ON public.api_keys
  FOR ALL USING (auth.uid() = user_id);

-- Teams policies
CREATE POLICY "Team members can view team" ON public.teams
  FOR SELECT USING (
    auth.uid() = owner_id OR 
    EXISTS (
      SELECT 1 FROM public.team_members 
      WHERE team_id = id AND user_id = auth.uid()
    )
  );

-- Team members policies
CREATE POLICY "Team members can view team membership" ON public.team_members
  FOR SELECT USING (
    auth.uid() = user_id OR 
    EXISTS (
      SELECT 1 FROM public.teams 
      WHERE id = team_id AND owner_id = auth.uid()
    )
  );

-- Functions and triggers for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_subscriptions
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_usage
  BEFORE UPDATE ON public.usage_tracking
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_teams
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to increment usage
CREATE OR REPLACE FUNCTION public.increment_usage(p_user_id uuid, p_month_year varchar)
RETURNS void AS $$
BEGIN
  INSERT INTO public.usage_tracking (user_id, month_year, analyses_used, updated_at)
  VALUES (p_user_id, p_month_year, 1, now())
  ON CONFLICT (user_id, month_year)
  DO UPDATE SET 
    analyses_used = usage_tracking.analyses_used + 1,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check usage limits
CREATE OR REPLACE FUNCTION public.check_usage_limit(p_user_id uuid, p_increment integer DEFAULT 1)
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
  FROM public.user_subscriptions s
  JOIN public.subscription_plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id 
    AND s.status = 'active'
    AND s.current_period_end > now()
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- If no active subscription, use free plan limits
  IF v_subscription IS NULL THEN
    SELECT analysis_limit INTO v_limit
    FROM public.subscription_plans 
    WHERE id = 'free';
  ELSE
    v_limit := v_subscription.analysis_limit;
  END IF;

  -- Get current usage
  SELECT analyses_used INTO v_current_usage
  FROM public.usage_tracking
  WHERE user_id = p_user_id AND month_year = v_current_month;

  IF v_current_usage IS NULL THEN
    v_current_usage := 0;
  END IF;

  -- Check if user would exceed limit
  IF v_limit > 0 AND (v_current_usage + p_increment) > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'current_usage', v_current_usage,
      'limit', v_limit,
      'remaining', v_limit - v_current_usage
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'current_usage', v_current_usage,
    'limit', v_limit,
    'remaining', CASE WHEN v_limit = -1 THEN -1 ELSE v_limit - v_current_usage END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;