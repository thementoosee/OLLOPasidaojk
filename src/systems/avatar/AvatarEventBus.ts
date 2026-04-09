/* ═══════════════════════════════════════════════════════════════
   AvatarEventBus — Typed event emitter for avatar ↔ UI comms
   ═══════════════════════════════════════════════════════════════
   Usage:
     avatarEvents.emit('cardFocused', { index: 2, position: ... });
     const unsub = avatarEvents.on('bigWin', (data) => { ... });
     unsub();                                                     */

import type { AvatarEventMap, AvatarEventName } from './types';

type Handler<K extends AvatarEventName> = (data: AvatarEventMap[K]) => void;

class AvatarEventBus {
  private listeners = new Map<AvatarEventName, Set<Handler<any>>>();

  on<K extends AvatarEventName>(event: K, handler: Handler<K>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => { this.listeners.get(event)?.delete(handler); };
  }

  once<K extends AvatarEventName>(event: K, handler: Handler<K>): () => void {
    const wrapped: Handler<K> = (data) => { unsub(); handler(data); };
    const unsub = this.on(event, wrapped);
    return unsub;
  }

  emit<K extends AvatarEventName>(event: K, data: AvatarEventMap[K]): void {
    this.listeners.get(event)?.forEach((h) => {
      try { h(data); } catch (e) { console.error(`[AvatarEventBus] Error in ${event} handler:`, e); }
    });
  }

  off<K extends AvatarEventName>(event: K, handler?: Handler<K>): void {
    if (handler) {
      this.listeners.get(event)?.delete(handler);
    } else {
      this.listeners.delete(event);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** Singleton — shared between avatar and carousel */
export const avatarEvents = new AvatarEventBus();
