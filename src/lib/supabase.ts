import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Upsert a slot's best result — only updates if the new win_amount is higher.
 */
export async function upsertSlotBestResult(
  slotName: string,
  betAmount: number,
  winAmount: number,
  multiplier: number,
  source: 'bonus_hunt' | 'chill' | 'bonus_opening'
) {
  try {
    // Check existing best for this slot
    const { data: existing } = await supabase
      .from('slot_best_results')
      .select('id, win_amount')
      .ilike('slot_name', slotName)
      .maybeSingle();

    if (existing) {
      // Only update if new payout is higher
      if (winAmount > (existing.win_amount || 0)) {
        await supabase
          .from('slot_best_results')
          .update({
            bet_amount: betAmount,
            win_amount: winAmount,
            multiplier: multiplier,
            source: source,
            recorded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      }
    } else {
      // First result for this slot
      await supabase
        .from('slot_best_results')
        .insert({
          slot_name: slotName,
          bet_amount: betAmount,
          win_amount: winAmount,
          multiplier: multiplier,
          source: source,
          recorded_at: new Date().toISOString(),
        });
    }
  } catch (error) {
    console.error('[upsertSlotBestResult] Error:', error);
  }
}

export type OverlayType = 'bar' | 'background' | 'bonus_hunt' | 'bonus_opening' | 'chill' | 'chatbox' | 'fever_champions' | 'fever_bracket' | 'fever_groups' | 'main_stream' | 'chat' | 'alerts';

export interface Overlay {
  id: string;
  type: OverlayType;
  name: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
}
