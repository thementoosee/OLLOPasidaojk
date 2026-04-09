import { io, Socket } from 'socket.io-client';

const SE_SOCKET_URL = 'https://realtime.streamelements.com';

export interface SEChatMessage {
  id: string;
  username: string;
  display_name: string;
  message: string;
  color: string;
  is_subscriber: boolean;
  is_moderator: boolean;
  created_at: string;
}

export interface SEEvent {
  id: string;
  event_id: string | null;
  event_type: string;
  username: string;
  display_name: string;
  amount: number;
  months: number;
  created_at: string;
}

type ChatListener = (message: SEChatMessage) => void;
type EventListener = (event: SEEvent) => void;

let socket: Socket | null = null;
const chatListeners: Set<ChatListener> = new Set();
const eventListeners: Set<EventListener> = new Set();
let connected = false;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseColor(data: Record<string, unknown>): string {
  if (data.tags && typeof data.tags === 'object' && 'color' in (data.tags as Record<string, unknown>)) {
    return ((data.tags as Record<string, unknown>).color as string) || '#ffffff';
  }
  return '#ffffff';
}

export function connectStreamElements(): void {
  const jwtToken = import.meta.env.VITE_SE_JWT_TOKEN;

  if (!jwtToken) {
    console.warn('⚠️ StreamElements: VITE_SE_JWT_TOKEN not set — skipping connection');
    return;
  }

  if (socket && connected) {
    return;
  }

  socket = io(SE_SOCKET_URL, {
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log('🟢 StreamElements: Connected');
    socket!.emit('authenticate', { method: 'jwt', token: jwtToken });
  });

  socket.on('authenticated', () => {
    connected = true;
    console.log('✅ StreamElements: Authenticated');
  });

  socket.on('unauthorized', (err: unknown) => {
    console.error('❌ StreamElements: Auth failed', err);
  });

  // ── Chat messages ──
  socket.on('chat.message', (data: Record<string, unknown>) => {
    const msg: SEChatMessage = {
      id: generateId(),
      username: (data.username as string) || '',
      display_name: (data.displayName as string) || (data.username as string) || '',
      message: (data.text as string) || '',
      color: parseColor(data),
      is_subscriber: Boolean(data.subscriber),
      is_moderator: Boolean(data.moderator),
      created_at: new Date().toISOString(),
    };
    chatListeners.forEach((fn) => fn(msg));
  });

  // ── StreamElements events ──
  socket.on('event', (data: Record<string, unknown>) => {
    if (!data || typeof data !== 'object') return;

    const type = (data.type as string) || '';
    const d = (data.data as Record<string, unknown>) || {};
    const eventData = d as Record<string, unknown>;

    const evt: SEEvent = {
      id: generateId(),
      event_id: (data._id as string) || null,
      event_type: mapEventType(type),
      username: (eventData.username as string) || (eventData.displayName as string) || '',
      display_name: (eventData.displayName as string) || (eventData.username as string) || '',
      amount: Number(eventData.amount) || 0,
      months: Number(eventData.months) || 0,
      created_at: new Date().toISOString(),
    };

    eventListeners.forEach((fn) => fn(evt));
  });

  // ── event:test (test events from SE dashboard) ──
  socket.on('event:test', (data: Record<string, unknown>) => {
    if (!data || typeof data !== 'object') return;

    const type = (data.listener as string) || '';
    const eventData = (data.event as Record<string, unknown>) || {};

    const evt: SEEvent = {
      id: generateId(),
      event_id: null,
      event_type: mapEventType(type),
      username: (eventData.name as string) || '',
      display_name: (eventData.name as string) || '',
      amount: Number(eventData.amount) || 0,
      months: Number(eventData.months) || 0,
      created_at: new Date().toISOString(),
    };

    eventListeners.forEach((fn) => fn(evt));
  });

  socket.on('disconnect', () => {
    connected = false;
    console.log('🔴 StreamElements: Disconnected');
  });
}

export function disconnectStreamElements(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    connected = false;
    console.log('🔌 StreamElements: Manually disconnected');
  }
}

export function onChatMessage(listener: ChatListener): () => void {
  chatListeners.add(listener);
  return () => chatListeners.delete(listener);
}

export function onStreamEvent(listener: EventListener): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

export function isConnected(): boolean {
  return connected;
}

function mapEventType(raw: string): string {
  const map: Record<string, string> = {
    'follow': 'follow',
    'follower': 'follow',
    'subscriber': 'subscriber',
    'subscription': 'subscriber',
    'resub': 'subscriber',
    'cheer': 'cheer',
    'bits': 'cheer',
    'tip': 'tip',
    'donation': 'tip',
    'raid': 'raid',
    'host': 'host',
  };
  return map[raw.toLowerCase()] || raw.toLowerCase();
}
