-- ============================================================
-- FEVER - Complete Database Setup Script (Fresh Supabase)
-- Run this in the Supabase SQL Editor on a fresh project
-- ============================================================

-- ============================================================
-- 1. OVERLAYS TABLE
-- ============================================================
CREATE TABLE overlays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  name text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE overlays ADD CONSTRAINT overlays_type_check 
  CHECK (type IN (
    'bar', 'background', 'bonus_hunt', 'bonus_opening', 'chill',
    'chatbox', 'fever_champions', 'fever_bracket', 'fever_groups',
    'main_stream', 'chat', 'alerts'
  ));

ALTER TABLE overlays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view overlays" ON overlays FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert overlays" ON overlays FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update overlays" ON overlays FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete overlays" ON overlays FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX idx_overlays_user_id ON overlays(user_id);
CREATE INDEX idx_overlays_type ON overlays(type);

ALTER PUBLICATION supabase_realtime ADD TABLE overlays;

-- ============================================================
-- 2. BRAND LOGOS TABLE
-- ============================================================
CREATE TABLE brand_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE brand_logos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view brand logos" ON brand_logos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert brand logos" ON brand_logos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update brand logos" ON brand_logos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete brand logos" ON brand_logos FOR DELETE TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE brand_logos;

CREATE OR REPLACE FUNCTION ensure_single_active_brand()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE brand_logos 
    SET is_active = false, updated_at = now()
    WHERE id != NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_active_brand_trigger
  BEFORE INSERT OR UPDATE ON brand_logos
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION ensure_single_active_brand();

-- ============================================================
-- 3. CASINOS TABLE
-- ============================================================
CREATE TABLE casinos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  thumbnail_url text DEFAULT '',
  is_active boolean DEFAULT false,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE casinos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view casinos" ON casinos FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert casinos" ON casinos FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update casinos" ON casinos FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete casinos" ON casinos FOR DELETE TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE casinos;

-- Seed default casinos
INSERT INTO casinos (name, thumbnail_url, is_active, order_index) VALUES
  ('Leon', 'https://i.imgur.com/wVqLzwT.png', false, 0),
  ('Empire Drop', 'https://i.imgur.com/wVqLzwT.png', false, 1),
  ('Stelario', 'https://i.imgur.com/wVqLzwT.png', false, 2),
  ('RioAce', 'https://i.imgur.com/wVqLzwT.png', false, 3),
  ('1xBit', 'https://i.imgur.com/wVqLzwT.png', false, 4),
  ('96', 'https://i.imgur.com/wVqLzwT.png', false, 5);

-- ============================================================
-- 4. SLOTS SYSTEM
-- ============================================================
CREATE TABLE slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text NOT NULL,
  image_url text,
  max_win integer DEFAULT 0,
  volatility text DEFAULT 'Medium',
  rtp decimal(5,2) DEFAULT 96.00,
  min_bet decimal(10,2) DEFAULT 0.20,
  max_bet decimal(10,2) DEFAULT 100.00,
  theme text,
  release_date date,
  features text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE slot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  session_date timestamptz DEFAULT now(),
  total_spins integer DEFAULT 0,
  total_wagered decimal(12,2) DEFAULT 0,
  total_won decimal(12,2) DEFAULT 0,
  biggest_win decimal(12,2) DEFAULT 0,
  biggest_win_multi decimal(10,2) DEFAULT 0,
  bonus_buys integer DEFAULT 0,
  bonus_hits integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE slot_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL UNIQUE REFERENCES slots(id) ON DELETE CASCADE,
  total_sessions integer DEFAULT 0,
  total_spins integer DEFAULT 0,
  total_wagered decimal(12,2) DEFAULT 0,
  total_won decimal(12,2) DEFAULT 0,
  profit_loss decimal(12,2) DEFAULT 0,
  best_win_amount decimal(12,2) DEFAULT 0,
  best_win_multi decimal(10,2) DEFAULT 0,
  total_bonus_buys integer DEFAULT 0,
  total_bonus_hits integer DEFAULT 0,
  avg_rtp_actual decimal(5,2) DEFAULT 0,
  last_played timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE slot_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL UNIQUE REFERENCES slots(id) ON DELETE CASCADE,
  is_favorite boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_slots_provider ON slots(provider);
CREATE INDEX idx_slots_volatility ON slots(volatility);
CREATE INDEX idx_slot_sessions_slot_id ON slot_sessions(slot_id);
CREATE INDEX idx_slot_sessions_date ON slot_sessions(session_date);
CREATE INDEX idx_slot_stats_slot_id ON slot_stats(slot_id);
CREATE INDEX idx_slot_favorites_slot_id ON slot_favorites(slot_id);
CREATE INDEX idx_slot_favorites_is_favorite ON slot_favorites(is_favorite);

ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view slots" ON slots FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert slots" ON slots FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update slots" ON slots FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete slots" ON slots FOR DELETE TO public USING (true);

CREATE POLICY "Anyone can view slot sessions" ON slot_sessions FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert slot sessions" ON slot_sessions FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update slot sessions" ON slot_sessions FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete slot sessions" ON slot_sessions FOR DELETE TO public USING (true);

CREATE POLICY "Anyone can view slot stats" ON slot_stats FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert slot stats" ON slot_stats FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update slot stats" ON slot_stats FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete slot stats" ON slot_stats FOR DELETE TO public USING (true);

CREATE POLICY "Anyone can view slot favorites" ON slot_favorites FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert slot favorites" ON slot_favorites FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update slot favorites" ON slot_favorites FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete slot favorites" ON slot_favorites FOR DELETE TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE slots;
ALTER PUBLICATION supabase_realtime ADD TABLE slot_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE slot_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE slot_favorites;

-- Default slot thumbnail trigger
CREATE OR REPLACE FUNCTION set_default_slot_thumbnail()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.image_url IS NULL OR NEW.image_url = '' THEN
    NEW.image_url := '/wVqLzwT_default.png';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_default_slot_thumbnail
  BEFORE INSERT OR UPDATE ON slots
  FOR EACH ROW
  EXECUTE FUNCTION set_default_slot_thumbnail();

-- Slot stats auto-update trigger
CREATE OR REPLACE FUNCTION update_slot_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO slot_stats (slot_id)
  VALUES (COALESCE(NEW.slot_id, OLD.slot_id))
  ON CONFLICT (slot_id) DO NOTHING;

  UPDATE slot_stats SET
    total_sessions = (SELECT COUNT(*) FROM slot_sessions WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id)),
    total_spins = (SELECT COALESCE(SUM(total_spins), 0) FROM slot_sessions WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id)),
    total_wagered = (SELECT COALESCE(SUM(total_wagered), 0) FROM slot_sessions WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id)),
    total_won = (SELECT COALESCE(SUM(total_won), 0) FROM slot_sessions WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id)),
    profit_loss = (SELECT COALESCE(SUM(total_won - total_wagered), 0) FROM slot_sessions WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id)),
    best_win_amount = (SELECT COALESCE(MAX(biggest_win), 0) FROM slot_sessions WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id)),
    best_win_multi = (SELECT COALESCE(MAX(biggest_win_multi), 0) FROM slot_sessions WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id)),
    total_bonus_buys = (SELECT COALESCE(SUM(bonus_buys), 0) FROM slot_sessions WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id)),
    total_bonus_hits = (SELECT COALESCE(SUM(bonus_hits), 0) FROM slot_sessions WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id)),
    avg_rtp_actual = (
      CASE 
        WHEN (SELECT COALESCE(SUM(total_wagered), 0) FROM slot_sessions WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id)) > 0
        THEN (SELECT COALESCE(SUM(total_won), 0) FROM slot_sessions WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id)) * 100.0 / 
             (SELECT COALESCE(SUM(total_wagered), 0) FROM slot_sessions WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id))
        ELSE 0
      END
    ),
    last_played = (SELECT MAX(session_date) FROM slot_sessions WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id)),
    updated_at = now()
  WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_slot_stats_insert AFTER INSERT ON slot_sessions FOR EACH ROW EXECUTE FUNCTION update_slot_stats();
CREATE TRIGGER trigger_update_slot_stats_update AFTER UPDATE ON slot_sessions FOR EACH ROW EXECUTE FUNCTION update_slot_stats();
CREATE TRIGGER trigger_update_slot_stats_delete AFTER DELETE ON slot_sessions FOR EACH ROW EXECUTE FUNCTION update_slot_stats();

-- ============================================================
-- 5. BONUS HUNTS SYSTEM
-- ============================================================
CREATE SEQUENCE bonus_hunt_number_seq START WITH 1;

CREATE TABLE bonus_hunts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Bonus Hunt',
  status text NOT NULL DEFAULT 'active',
  total_invested decimal(12,2) DEFAULT 0,
  total_won decimal(12,2) DEFAULT 0,
  initial_break_even numeric DEFAULT 0,
  current_break_even numeric DEFAULT 0,
  profit_loss decimal(12,2) DEFAULT 0,
  bonus_count integer DEFAULT 0,
  opened_count integer DEFAULT 0,
  manual_investment boolean DEFAULT false,
  streamer_name text,
  brand_logo_id uuid REFERENCES brand_logos(id),
  hunt_number integer DEFAULT nextval('bonus_hunt_number_seq'),
  show_on_main_overlay boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('active', 'opening', 'completed'))
);

CREATE TABLE bonus_hunt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id uuid NOT NULL REFERENCES bonus_hunts(id) ON DELETE CASCADE,
  slot_id uuid REFERENCES slots(id) ON DELETE SET NULL,
  slot_name text DEFAULT '',
  bet_amount decimal(10,2) DEFAULT 0,
  payment_amount decimal(12,2),
  result_amount decimal(12,2),
  multiplier decimal(10,2),
  status text NOT NULL DEFAULT 'pending',
  order_index integer NOT NULL,
  opened_at timestamptz,
  slot_image_url text,
  is_super_bonus boolean DEFAULT false,
  is_extreme_bonus boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_item_status CHECK (status IN ('pending', 'opened'))
);

CREATE INDEX idx_bonus_hunts_status ON bonus_hunts(status);
CREATE INDEX idx_bonus_hunts_created ON bonus_hunts(created_at DESC);
CREATE INDEX idx_bonus_hunt_items_hunt_id ON bonus_hunt_items(hunt_id);
CREATE INDEX idx_bonus_hunt_items_order ON bonus_hunt_items(hunt_id, order_index);
CREATE INDEX idx_bonus_hunt_items_status ON bonus_hunt_items(status);

ALTER TABLE bonus_hunts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_hunt_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view bonus hunts" ON bonus_hunts FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert bonus hunts" ON bonus_hunts FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update bonus hunts" ON bonus_hunts FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete bonus hunts" ON bonus_hunts FOR DELETE TO public USING (true);

CREATE POLICY "Anyone can view bonus hunt items" ON bonus_hunt_items FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert bonus hunt items" ON bonus_hunt_items FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update bonus hunt items" ON bonus_hunt_items FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete bonus hunt items" ON bonus_hunt_items FOR DELETE TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE bonus_hunts;
ALTER PUBLICATION supabase_realtime ADD TABLE bonus_hunt_items;

-- Bonus hunt item multiplier auto-calculation trigger
CREATE OR REPLACE FUNCTION calculate_bonus_hunt_item_multiplier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_amount IS NOT NULL THEN
    NEW.result_amount := NEW.payment_amount;
    IF NEW.bet_amount > 0 THEN
      NEW.multiplier := NEW.payment_amount / NEW.bet_amount;
    ELSE
      NEW.multiplier := 0;
    END IF;
    NEW.status := 'opened';
    NEW.opened_at := COALESCE(NEW.opened_at, now());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_hunt_item_multiplier
  BEFORE INSERT OR UPDATE ON bonus_hunt_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_bonus_hunt_item_multiplier();

-- Bonus hunt totals trigger (FINAL version with locked initial_break_even)
CREATE OR REPLACE FUNCTION update_bonus_hunt_totals()
RETURNS TRIGGER AS $$
DECLARE
  hunt_record RECORD;
  current_hunt RECORD;
  v_total_payment numeric;
  v_remaining_payment numeric;
  v_initial_break_even numeric;
  v_current_break_even numeric;
BEGIN
  SELECT manual_investment, status, initial_break_even
  INTO current_hunt
  FROM bonus_hunts
  WHERE id = COALESCE(NEW.hunt_id, OLD.hunt_id);

  SELECT
    bh.id,
    bh.total_invested,
    COUNT(bhi.id) as total_bonuses,
    COUNT(CASE WHEN bhi.status = 'opened' THEN 1 END) as opened_bonuses,
    COALESCE(SUM(COALESCE(bhi.payment_amount, bhi.bet_amount)), 0) as total_payment,
    COALESCE(SUM(CASE WHEN bhi.status = 'pending' THEN COALESCE(bhi.payment_amount, bhi.bet_amount) ELSE 0 END), 0) as remaining_payment,
    COALESCE(SUM(CASE WHEN bhi.status = 'opened' THEN bhi.result_amount ELSE 0 END), 0) as total_won
  INTO hunt_record
  FROM bonus_hunts bh
  LEFT JOIN bonus_hunt_items bhi ON bhi.hunt_id = bh.id
  WHERE bh.id = COALESCE(NEW.hunt_id, OLD.hunt_id)
  GROUP BY bh.id, bh.total_invested;

  v_total_payment    := hunt_record.total_payment;
  v_remaining_payment := hunt_record.remaining_payment;

  -- Only recalculate initial_break_even while status = 'active'
  IF current_hunt.status = 'active' THEN
    IF v_total_payment > 0 THEN
      IF current_hunt.manual_investment THEN
        v_initial_break_even := hunt_record.total_invested / v_total_payment;
      ELSE
        v_initial_break_even := v_total_payment / v_total_payment;
      END IF;
    ELSE
      v_initial_break_even := 0;
    END IF;
  ELSE
    v_initial_break_even := current_hunt.initial_break_even;
  END IF;

  -- Calculate current_break_even (always live)
  IF v_remaining_payment > 0 THEN
    IF current_hunt.manual_investment THEN
      v_current_break_even := (hunt_record.total_invested - hunt_record.total_won) / v_remaining_payment;
    ELSE
      v_current_break_even := (v_total_payment - hunt_record.total_won) / v_remaining_payment;
    END IF;
  ELSIF hunt_record.opened_bonuses > 0 THEN
    v_current_break_even := 0;
  ELSE
    v_current_break_even := v_initial_break_even;
  END IF;

  IF current_hunt.manual_investment THEN
    UPDATE bonus_hunts SET
      bonus_count        = hunt_record.total_bonuses,
      opened_count       = hunt_record.opened_bonuses,
      total_won          = hunt_record.total_won,
      initial_break_even = v_initial_break_even,
      current_break_even = GREATEST(0, v_current_break_even),
      profit_loss        = hunt_record.total_won - total_invested,
      updated_at         = now()
    WHERE id = hunt_record.id;
  ELSE
    UPDATE bonus_hunts SET
      bonus_count        = hunt_record.total_bonuses,
      opened_count       = hunt_record.opened_bonuses,
      total_invested     = hunt_record.total_payment,
      total_won          = hunt_record.total_won,
      initial_break_even = v_initial_break_even,
      current_break_even = GREATEST(0, v_current_break_even),
      profit_loss        = hunt_record.total_won - hunt_record.total_payment,
      updated_at         = now()
    WHERE id = hunt_record.id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_hunt_on_insert AFTER INSERT ON bonus_hunt_items FOR EACH ROW EXECUTE FUNCTION update_bonus_hunt_totals();
CREATE TRIGGER trigger_update_hunt_on_update AFTER UPDATE ON bonus_hunt_items FOR EACH ROW EXECUTE FUNCTION update_bonus_hunt_totals();
CREATE TRIGGER trigger_update_hunt_on_delete AFTER DELETE ON bonus_hunt_items FOR EACH ROW EXECUTE FUNCTION update_bonus_hunt_totals();

-- ============================================================
-- 6. BONUS OPENINGS SYSTEM
-- ============================================================
CREATE SEQUENCE bonus_opening_number_seq START WITH 1;

CREATE TABLE bonus_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Bonus Opening',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  total_investment numeric DEFAULT 0,
  total_payout numeric DEFAULT 0,
  profit_loss numeric DEFAULT 0,
  current_multiplier numeric DEFAULT 0,
  current_break_even numeric DEFAULT 0,
  initial_break_even numeric DEFAULT 0,
  initial_investment numeric DEFAULT 0,
  streamer_name text DEFAULT '',
  brand_logo_id uuid REFERENCES brand_logos(id),
  opening_number integer DEFAULT nextval('bonus_opening_number_seq'),
  show_on_main_overlay boolean DEFAULT false,
  source_hunt_id uuid REFERENCES bonus_hunts(id) ON DELETE SET NULL,
  source_hunt_number integer,
  source_hunt_date timestamptz,
  source_hunt_investment numeric DEFAULT 0,
  hunt_number integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE bonus_opening_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_opening_id uuid NOT NULL REFERENCES bonus_openings(id) ON DELETE CASCADE,
  slot_name text NOT NULL DEFAULT '',
  slot_image text DEFAULT '',
  payment numeric NOT NULL DEFAULT 0,
  payout numeric DEFAULT 0,
  multiplier numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'opened')),
  super_bonus boolean DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_bonus_opening_items_opening_id ON bonus_opening_items(bonus_opening_id);
CREATE INDEX idx_bonus_opening_items_status ON bonus_opening_items(status);
CREATE INDEX idx_bonus_openings_status ON bonus_openings(status);

ALTER TABLE bonus_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_opening_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view bonus openings" ON bonus_openings FOR SELECT USING (true);
CREATE POLICY "Public can insert bonus openings" ON bonus_openings FOR INSERT WITH CHECK (true);
CREATE POLICY "Bonus openings are updatable by anyone" ON bonus_openings FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete bonus openings" ON bonus_openings FOR DELETE USING (true);

CREATE POLICY "Public can view bonus opening items" ON bonus_opening_items FOR SELECT USING (true);
CREATE POLICY "Public can insert bonus opening items" ON bonus_opening_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update bonus opening items" ON bonus_opening_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete bonus opening items" ON bonus_opening_items FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE bonus_openings;
ALTER PUBLICATION supabase_realtime ADD TABLE bonus_opening_items;

-- Bonus opening item multiplier trigger
CREATE OR REPLACE FUNCTION update_bonus_opening_item_multiplier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment > 0 THEN
    NEW.multiplier := NEW.payout / NEW.payment;
  ELSE
    NEW.multiplier := 0;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_bonus_opening_item_multiplier
  BEFORE INSERT OR UPDATE ON bonus_opening_items
  FOR EACH ROW
  EXECUTE FUNCTION update_bonus_opening_item_multiplier();

-- Bonus opening totals trigger (FINAL version with real-time break-even)
CREATE OR REPLACE FUNCTION update_bonus_opening_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_initial_investment numeric;
  v_total_payout numeric;
  v_profit_loss numeric;
  v_current_multiplier numeric;
  v_current_break_even numeric;
  v_initial_break_even numeric;
  v_opened_items integer;
  v_total_items integer;
  v_remaining_bet_sum numeric;
  v_amount_needed numeric;
BEGIN
  SELECT initial_investment, initial_break_even
  INTO v_initial_investment, v_initial_break_even
  FROM bonus_openings
  WHERE id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  SELECT 
    COALESCE(SUM(payout), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'opened')
  INTO v_total_payout, v_total_items, v_opened_items
  FROM bonus_opening_items
  WHERE bonus_opening_id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  v_profit_loss := v_total_payout - v_initial_investment;
  
  IF v_initial_investment > 0 THEN
    v_current_multiplier := v_total_payout / v_initial_investment;
  ELSE
    v_current_multiplier := 0;
  END IF;
  
  IF v_opened_items = 0 THEN
    v_current_break_even := v_initial_break_even;
  ELSIF v_opened_items = v_total_items THEN
    v_current_break_even := 0;
  ELSE
    SELECT COALESCE(SUM(payment), 0)
    INTO v_remaining_bet_sum
    FROM bonus_opening_items
    WHERE bonus_opening_id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id)
      AND status = 'pending';
    
    IF v_remaining_bet_sum > 0 THEN
      v_amount_needed := GREATEST(0, v_initial_investment - v_total_payout);
      v_current_break_even := v_amount_needed / v_remaining_bet_sum;
    ELSE
      v_current_break_even := 0;
    END IF;
  END IF;
  
  UPDATE bonus_openings SET
    total_investment = v_initial_investment,
    total_payout = v_total_payout,
    profit_loss = v_profit_loss,
    current_multiplier = v_current_multiplier,
    current_break_even = v_current_break_even,
    updated_at = now()
  WHERE id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_bonus_opening_totals
  AFTER INSERT OR UPDATE OR DELETE ON bonus_opening_items
  FOR EACH ROW
  EXECUTE FUNCTION update_bonus_opening_totals();

-- ============================================================
-- 7. CHILL SESSIONS SYSTEM
-- ============================================================
CREATE TABLE chill_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_name text NOT NULL,
  streamer_name text,
  brand_logo_id uuid REFERENCES brand_logos(id),
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  total_bonuses integer DEFAULT 0,
  total_bet decimal(10,2) DEFAULT 0,
  total_won decimal(10,2) DEFAULT 0,
  max_win decimal(10,2) DEFAULT 0,
  max_multiplier decimal(10,2) DEFAULT 0,
  show_on_main_overlay boolean DEFAULT false,
  chill_overlay_config jsonb DEFAULT '{
    "slot_image": "",
    "background_color": "#10b981",
    "accent_color": "#059669",
    "text_color": "#ffffff",
    "show_slot_info": true,
    "show_session_stats": true,
    "show_personal_best": true
  }'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE chill_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chill_sessions(id) ON DELETE CASCADE,
  slot_name text,
  bet_amount decimal(10,2) NOT NULL,
  win_amount decimal(10,2) NOT NULL,
  multiplier decimal(10,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chill_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chill_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view chill sessions" ON chill_sessions FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert chill sessions" ON chill_sessions FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update chill sessions" ON chill_sessions FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete chill sessions" ON chill_sessions FOR DELETE TO public USING (true);

CREATE POLICY "Anyone can view chill bonuses" ON chill_bonuses FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert chill bonuses" ON chill_bonuses FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update chill bonuses" ON chill_bonuses FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete chill bonuses" ON chill_bonuses FOR DELETE TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE chill_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE chill_bonuses;

-- Chill session stats trigger
CREATE OR REPLACE FUNCTION update_chill_session_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_session_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_session_id := OLD.session_id;
  ELSE
    v_session_id := NEW.session_id;
  END IF;

  UPDATE chill_sessions SET 
    total_bonuses = (SELECT COUNT(*) FROM chill_bonuses WHERE session_id = v_session_id),
    total_bet = (SELECT COALESCE(SUM(bet_amount), 0) FROM chill_bonuses WHERE session_id = v_session_id),
    total_won = (SELECT COALESCE(SUM(win_amount), 0) FROM chill_bonuses WHERE session_id = v_session_id),
    max_win = (SELECT COALESCE(MAX(win_amount), 0) FROM chill_bonuses WHERE session_id = v_session_id),
    max_multiplier = (SELECT COALESCE(MAX(multiplier), 0) FROM chill_bonuses WHERE session_id = v_session_id),
    updated_at = now()
  WHERE id = v_session_id;
  
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_session_stats_on_bonus_insert AFTER INSERT ON chill_bonuses FOR EACH ROW EXECUTE FUNCTION update_chill_session_stats();
CREATE TRIGGER update_session_stats_on_bonus_update AFTER UPDATE ON chill_bonuses FOR EACH ROW EXECUTE FUNCTION update_chill_session_stats();
CREATE TRIGGER update_session_stats_on_bonus_delete AFTER DELETE ON chill_bonuses FOR EACH ROW EXECUTE FUNCTION update_chill_session_stats();

-- ============================================================
-- 8. TOP WINS SYSTEM
-- ============================================================
CREATE TABLE top_wins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_name text NOT NULL,
  slot_image_url text,
  win_amount numeric NOT NULL DEFAULT 0,
  bet_amount numeric NOT NULL DEFAULT 0,
  multiplier numeric GENERATED ALWAYS AS (
    CASE WHEN bet_amount > 0 THEN ROUND(win_amount / bet_amount, 2) ELSE 0 END
  ) STORED,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE top_wins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view top wins" ON top_wins FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can create top wins" ON top_wins FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update top wins" ON top_wins FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete top wins" ON top_wins FOR DELETE TO public USING (true);

CREATE OR REPLACE FUNCTION update_top_wins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_top_wins_updated_at
  BEFORE UPDATE ON top_wins
  FOR EACH ROW
  EXECUTE FUNCTION update_top_wins_updated_at();

CREATE INDEX idx_top_wins_multiplier ON top_wins(multiplier DESC);
CREATE INDEX idx_top_wins_created_at ON top_wins(created_at DESC);

-- ============================================================
-- 9. GIVEAWAY SYSTEM
-- ============================================================
CREATE TABLE giveaways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  command text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'drawing', 'completed')),
  winner_username text,
  winner_profile_image_url text,
  total_participants integer DEFAULT 0,
  is_visible boolean DEFAULT false,
  duration_minutes integer DEFAULT 30,
  end_time timestamptz,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE giveaway_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id uuid NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
  username text NOT NULL,
  user_id text NOT NULL,
  profile_image_url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(giveaway_id, user_id)
);

ALTER TABLE giveaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE giveaway_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view giveaways" ON giveaways FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert giveaways" ON giveaways FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update giveaways" ON giveaways FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete giveaways" ON giveaways FOR DELETE TO public USING (true);

CREATE POLICY "Anyone can view participants" ON giveaway_participants FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert participants" ON giveaway_participants FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update participants" ON giveaway_participants FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete participants" ON giveaway_participants FOR DELETE TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE giveaways;
ALTER PUBLICATION supabase_realtime ADD TABLE giveaway_participants;

-- Giveaway participants count trigger
CREATE OR REPLACE FUNCTION update_giveaway_participants_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE giveaways SET total_participants = (
      SELECT COUNT(*) FROM giveaway_participants WHERE giveaway_id = NEW.giveaway_id
    ) WHERE id = NEW.giveaway_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE giveaways SET total_participants = (
      SELECT COUNT(*) FROM giveaway_participants WHERE giveaway_id = OLD.giveaway_id
    ) WHERE id = OLD.giveaway_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER giveaway_participants_count_trigger
  AFTER INSERT OR DELETE ON giveaway_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_giveaway_participants_count();

-- Giveaway end time trigger
CREATE OR REPLACE FUNCTION set_giveaway_end_time()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.duration_minutes IS NOT NULL AND NEW.end_time IS NULL THEN
    NEW.end_time := NEW.created_at + (NEW.duration_minutes || ' minutes')::interval;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_giveaway_end_time_trigger
  BEFORE INSERT ON giveaways
  FOR EACH ROW
  EXECUTE FUNCTION set_giveaway_end_time();

-- ============================================================
-- 10. FEVER CHAMPIONS LEAGUE SYSTEM
-- ============================================================
CREATE TABLE fever_tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tournament_number integer,
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'completed')),
  current_phase text NOT NULL DEFAULT 'group_stage' CHECK (current_phase IN ('group_stage', 'knockout')),
  show_on_main_overlay boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE fever_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  group_name text NOT NULL CHECK (group_name IN ('A', 'B', 'C', 'D')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(tournament_id, group_name)
);

CREATE TABLE fever_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES fever_groups(id) ON DELETE CASCADE,
  viewer_name text NOT NULL,
  slot_name text NOT NULL DEFAULT '',
  slot_image text DEFAULT '',
  points integer NOT NULL DEFAULT 0,
  spins_count integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE fever_spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES fever_participants(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  multiplier numeric(10,2) NOT NULL DEFAULT 0,
  points_earned integer NOT NULL DEFAULT 0 CHECK (points_earned >= 0 AND points_earned <= 3),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE fever_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES fever_groups(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  participant1_id uuid NOT NULL REFERENCES fever_participants(id) ON DELETE CASCADE,
  participant2_id uuid NOT NULL REFERENCES fever_participants(id) ON DELETE CASCADE,
  participant1_points integer NOT NULL DEFAULT 0,
  participant2_points integer NOT NULL DEFAULT 0,
  participant1_bonus_result numeric(10,2) DEFAULT 0,
  participant1_bonus2_result numeric(10,2) DEFAULT 0,
  participant2_bonus_result numeric(10,2) DEFAULT 0,
  participant2_bonus2_result numeric(10,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE fever_playoff_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('quarter_finals', 'semi_finals', 'final')),
  match_number integer NOT NULL,
  participant1_id uuid REFERENCES fever_participants(id) ON DELETE CASCADE,
  participant2_id uuid REFERENCES fever_participants(id) ON DELETE CASCADE,
  participant1_bonus_result numeric(10,2) DEFAULT 0,
  participant1_bonus2_result numeric(10,2) DEFAULT 0,
  participant2_bonus_result numeric(10,2) DEFAULT 0,
  participant2_bonus2_result numeric(10,2) DEFAULT 0,
  winner_id uuid REFERENCES fever_participants(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_fever_groups_tournament ON fever_groups(tournament_id);
CREATE INDEX idx_fever_participants_tournament ON fever_participants(tournament_id);
CREATE INDEX idx_fever_participants_group ON fever_participants(group_id);
CREATE INDEX idx_fever_spins_participant ON fever_spins(participant_id);
CREATE INDEX idx_fever_spins_tournament ON fever_spins(tournament_id);
CREATE INDEX idx_fever_matches_tournament ON fever_matches(tournament_id);
CREATE INDEX idx_fever_matches_group ON fever_matches(group_id);
CREATE INDEX idx_fever_playoff_matches_tournament ON fever_playoff_matches(tournament_id);

ALTER TABLE fever_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_spins ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_playoff_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view tournaments" ON fever_tournaments FOR SELECT USING (true);
CREATE POLICY "Public can insert tournaments" ON fever_tournaments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update tournaments" ON fever_tournaments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete tournaments" ON fever_tournaments FOR DELETE USING (true);

CREATE POLICY "Public can view groups" ON fever_groups FOR SELECT USING (true);
CREATE POLICY "Public can insert groups" ON fever_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update groups" ON fever_groups FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete groups" ON fever_groups FOR DELETE USING (true);

CREATE POLICY "Public can view participants" ON fever_participants FOR SELECT USING (true);
CREATE POLICY "Public can insert participants" ON fever_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update participants" ON fever_participants FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete participants" ON fever_participants FOR DELETE USING (true);

CREATE POLICY "Public can view spins" ON fever_spins FOR SELECT USING (true);
CREATE POLICY "Public can insert spins" ON fever_spins FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update spins" ON fever_spins FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete spins" ON fever_spins FOR DELETE USING (true);

CREATE POLICY "Public can view matches" ON fever_matches FOR SELECT USING (true);
CREATE POLICY "Public can insert matches" ON fever_matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update matches" ON fever_matches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete matches" ON fever_matches FOR DELETE USING (true);

CREATE POLICY "Public can view playoff matches" ON fever_playoff_matches FOR SELECT USING (true);
CREATE POLICY "Public can insert playoff matches" ON fever_playoff_matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update playoff matches" ON fever_playoff_matches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete playoff matches" ON fever_playoff_matches FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE fever_tournaments;
ALTER PUBLICATION supabase_realtime ADD TABLE fever_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE fever_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE fever_spins;
ALTER PUBLICATION supabase_realtime ADD TABLE fever_matches;
ALTER PUBLICATION supabase_realtime ADD TABLE fever_playoff_matches;

-- Tournament number auto-increment
CREATE OR REPLACE FUNCTION set_fever_tournament_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tournament_number IS NULL THEN
    SELECT COALESCE(MAX(tournament_number), 0) + 1
    INTO NEW.tournament_number
    FROM fever_tournaments;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tournament_number_before_insert
  BEFORE INSERT ON fever_tournaments
  FOR EACH ROW
  EXECUTE FUNCTION set_fever_tournament_number();

-- Fever points calculation (updated formula: avg of 2 bonuses)
CREATE OR REPLACE FUNCTION calculate_fever_points(bonus1_result numeric, bonus2_result numeric)
RETURNS integer AS $$
DECLARE
  avg_result numeric;
BEGIN
  avg_result := (bonus1_result + bonus2_result) / 2;
  IF avg_result >= 10000 THEN RETURN 3;
  ELSIF avg_result >= 5000 THEN RETURN 2;
  ELSIF avg_result >= 2501 THEN RETURN 1;
  ELSE RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Match points auto-calculation
CREATE OR REPLACE FUNCTION update_fever_match_points()
RETURNS TRIGGER AS $$
BEGIN
  NEW.participant1_points := calculate_fever_points(
    COALESCE(NEW.participant1_bonus_result, 0),
    COALESCE(NEW.participant1_bonus2_result, 0)
  );
  NEW.participant2_points := calculate_fever_points(
    COALESCE(NEW.participant2_bonus_result, 0),
    COALESCE(NEW.participant2_bonus2_result, 0)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_match_points
  BEFORE INSERT OR UPDATE ON fever_matches
  FOR EACH ROW
  EXECUTE FUNCTION update_fever_match_points();

-- Auto-update participant rankings
CREATE OR REPLACE FUNCTION update_fever_participant_rankings()
RETURNS TRIGGER AS $$
DECLARE
  affected_group_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_group_id := OLD.group_id;
  ELSE
    affected_group_id := NEW.group_id;
  END IF;

  WITH match_results AS (
    SELECT participant_id, SUM(points) as total_points
    FROM (
      SELECT participant1_id as participant_id, participant1_points as points
      FROM fever_matches WHERE group_id = affected_group_id
      UNION ALL
      SELECT participant2_id as participant_id, participant2_points as points
      FROM fever_matches WHERE group_id = affected_group_id
    ) combined
    GROUP BY participant_id
  ),
  ranked AS (
    SELECT 
      p.id,
      COALESCE(mr.total_points, 0) as points,
      ROW_NUMBER() OVER (ORDER BY COALESCE(mr.total_points, 0) DESC) as new_position
    FROM fever_participants p
    LEFT JOIN match_results mr ON p.id = mr.participant_id
    WHERE p.group_id = affected_group_id
  )
  UPDATE fever_participants p SET 
    points = ranked.points,
    position = ranked.new_position::integer,
    updated_at = now()
  FROM ranked WHERE p.id = ranked.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_update_rankings_after_match_change
  AFTER INSERT OR UPDATE OR DELETE ON fever_matches
  FOR EACH ROW
  EXECUTE FUNCTION update_fever_participant_rankings();

-- Advance playoff winners
CREATE OR REPLACE FUNCTION advance_playoff_winners()
RETURNS TRIGGER AS $$
DECLARE
  p1_avg numeric;
  p2_avg numeric;
  winner_participant_id uuid;
  next_stage text;
  next_match_number integer;
BEGIN
  IF NEW.participant1_id IS NULL OR NEW.participant2_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.participant1_bonus_result > 0 AND NEW.participant2_bonus_result > 0 THEN
    p1_avg := (NEW.participant1_bonus_result + NEW.participant1_bonus2_result) / 2;
    p2_avg := (NEW.participant2_bonus_result + NEW.participant2_bonus2_result) / 2;
    
    IF p1_avg > p2_avg THEN
      winner_participant_id := NEW.participant1_id;
    ELSIF p2_avg > p1_avg THEN
      winner_participant_id := NEW.participant2_id;
    ELSE
      RETURN NEW;
    END IF;
    
    UPDATE fever_playoff_matches SET winner_id = winner_participant_id WHERE id = NEW.id;
    
    IF NEW.stage = 'quarter_finals' THEN
      next_stage := 'semi_finals';
      next_match_number := CASE WHEN NEW.match_number <= 2 THEN 1 ELSE 2 END;
      
      UPDATE fever_playoff_matches
      SET participant1_id = winner_participant_id
      WHERE tournament_id = NEW.tournament_id AND stage = next_stage
        AND match_number = next_match_number AND participant1_id IS NULL;
      
      IF NOT FOUND THEN
        UPDATE fever_playoff_matches
        SET participant2_id = winner_participant_id
        WHERE tournament_id = NEW.tournament_id AND stage = next_stage
          AND match_number = next_match_number;
      END IF;
      
    ELSIF NEW.stage = 'semi_finals' THEN
      next_stage := 'final';
      
      UPDATE fever_playoff_matches
      SET participant1_id = winner_participant_id
      WHERE tournament_id = NEW.tournament_id AND stage = next_stage AND participant1_id IS NULL;
      
      IF NOT FOUND THEN
        UPDATE fever_playoff_matches
        SET participant2_id = winner_participant_id
        WHERE tournament_id = NEW.tournament_id AND stage = next_stage;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_advance_playoff_winners
  AFTER UPDATE ON fever_playoff_matches
  FOR EACH ROW
  WHEN (OLD.participant1_bonus_result IS DISTINCT FROM NEW.participant1_bonus_result 
     OR OLD.participant2_bonus_result IS DISTINCT FROM NEW.participant2_bonus_result)
  EXECUTE FUNCTION advance_playoff_winners();

-- ============================================================
-- 11. TOP SLOTS STATISTICS
-- ============================================================
CREATE TABLE top_slots_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_name text NOT NULL,
  slot_image text,
  total_bonuses integer DEFAULT 0,
  total_bet numeric DEFAULT 0,
  total_won numeric DEFAULT 0,
  profit numeric DEFAULT 0,
  average_multiplier numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE top_slots_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to top_slots_stats" ON top_slots_stats FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to top_slots_stats" ON top_slots_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access to top_slots_stats" ON top_slots_stats FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to top_slots_stats" ON top_slots_stats FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE top_slots_stats;

-- Seed sample data
INSERT INTO top_slots_stats (slot_name, slot_image, total_bonuses, total_bet, total_won, profit, average_multiplier) VALUES
  ('Gates of Olympus', '/wVqLzwT_default.png', 25, 500.00, 1250.00, 750.00, 2.50),
  ('Sweet Bonanza', '/wVqLzwT_default.png', 30, 600.00, 1350.00, 750.00, 2.25),
  ('The Dog House', '/wVqLzwT_default.png', 20, 400.00, 920.00, 520.00, 2.30),
  ('Wanted Dead or a Wild', '/wVqLzwT_default.png', 15, 300.00, 750.00, 450.00, 2.50),
  ('Sugar Rush', '/wVqLzwT_default.png', 18, 360.00, 800.00, 440.00, 2.22);

-- ============================================================
-- SLOT BEST RESULTS TABLE
-- ============================================================
CREATE TABLE slot_best_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_name text NOT NULL,
  bet_amount decimal(10,2) NOT NULL,
  win_amount decimal(10,2) NOT NULL,
  multiplier decimal(10,2) NOT NULL,
  source text NOT NULL DEFAULT 'bonus_hunt' CHECK (source IN ('bonus_hunt', 'chill', 'bonus_opening')),
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_slot_best_results_slot_name ON slot_best_results (lower(slot_name));

ALTER TABLE slot_best_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view slot best results" ON slot_best_results FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert slot best results" ON slot_best_results FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update slot best results" ON slot_best_results FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete slot best results" ON slot_best_results FOR DELETE TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE slot_best_results;

-- ============================================================
-- DONE! Your database is ready.
-- ============================================================
