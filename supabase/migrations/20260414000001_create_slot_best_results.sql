-- ============================================================
-- SLOT BEST RESULTS TABLE
-- Stores the all-time best result per slot (highest payout wins).
-- Updated from both bonus hunts/openings and chill sessions.
-- ============================================================

CREATE TABLE IF NOT EXISTS slot_best_results (
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

-- One best result per slot (case-insensitive match)
CREATE UNIQUE INDEX idx_slot_best_results_slot_name ON slot_best_results (lower(slot_name));

ALTER TABLE slot_best_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view slot best results" ON slot_best_results FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert slot best results" ON slot_best_results FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update slot best results" ON slot_best_results FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete slot best results" ON slot_best_results FOR DELETE TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE slot_best_results;
