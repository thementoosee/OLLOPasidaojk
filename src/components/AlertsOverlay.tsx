import { useEffect, useState } from 'react';
import { UserPlus, Swords, Star, Zap, DollarSign } from 'lucide-react';
import {
  connectStreamElements,
  disconnectStreamElements,
  onStreamEvent,
  type SEEvent,
} from '../lib/streamelements';

interface AlertDisplay {
  id: string;
  event_type: string;
  display_name: string;
  amount: number;
  months: number;
  visible: boolean;
}

export function AlertsOverlay() {
  const [currentAlert, setCurrentAlert] = useState<AlertDisplay | null>(null);

  useEffect(() => {
    connectStreamElements();

    const unsub = onStreamEvent((evt: SEEvent) => {
      const alert: AlertDisplay = {
        id: evt.id,
        event_type: evt.event_type,
        display_name: evt.display_name,
        amount: evt.amount,
        months: evt.months,
        visible: true,
      };
      setCurrentAlert(alert);

      setTimeout(() => {
        setCurrentAlert((prev) => (prev?.id === alert.id ? null : prev));
      }, 6000);
    });

    return () => {
      unsub();
      disconnectStreamElements();
    };
  }, []);

  if (!currentAlert) return null;

  const getAlertConfig = () => {
    switch (currentAlert.event_type) {
      case 'follow':
        return { icon: UserPlus, bg: '#10b981', label: 'NEW FOLLOWER' };
      case 'subscriber':
        return {
          icon: Star,
          bg: '#a855f7',
          label: currentAlert.months > 1 ? `RESUB × ${currentAlert.months}` : 'NEW SUB',
        };
      case 'cheer':
        return { icon: DollarSign, bg: '#f59e0b', label: `${currentAlert.amount} BITS` };
      case 'tip':
        return { icon: DollarSign, bg: '#22c55e', label: `€${currentAlert.amount?.toFixed(2)} TIP` };
      case 'raid':
        return { icon: Swords, bg: '#f97316', label: `RAID × ${currentAlert.amount}` };
      default:
        return { icon: Zap, bg: '#3b82f6', label: currentAlert.event_type.toUpperCase() };
    }
  };

  const { icon: Icon, bg, label } = getAlertConfig();

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
      <div
        className="px-8 py-5 rounded-2xl text-center animate-bounce-in"
        style={{
          background: `linear-gradient(145deg, ${bg}dd, ${bg}88)`,
          border: `2px solid ${bg}`,
          boxShadow: `0 0 40px ${bg}66, 0 20px 40px rgba(0,0,0,0.4)`,
        }}
      >
        <Icon className="w-10 h-10 text-white mx-auto mb-2" />
        <div className="text-xs font-bold uppercase tracking-widest text-white/80">{label}</div>
        <div className="text-2xl font-black text-white mt-1">{currentAlert.display_name}</div>
      </div>
    </div>
  );
}
