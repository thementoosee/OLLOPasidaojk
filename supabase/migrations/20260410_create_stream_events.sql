CREATE TABLE IF NOT EXISTS stream_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  username text NOT NULL,
  display_name text NOT NULL,
  amount numeric DEFAULT 0,
  months integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stream_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to stream_events" ON stream_events FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE stream_events;
