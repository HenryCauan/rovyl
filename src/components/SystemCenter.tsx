import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Volume2, Sun, Wifi, Bluetooth, Moon,
  Battery, Music, SkipBack, SkipForward, Play, Pause, X
} from 'lucide-react';
import { Coordinates, UIConfig } from '../types';
import { getTranslation } from '../translations';

interface SystemCenterProps {
  position: Coordinates;
  onClose: () => void;
  config: UIConfig;
}

export const SystemCenter: React.FC<SystemCenterProps> = ({ position, onClose, config }) => {
  // Actual System State
  const [volume, setVolume] = useState(50);
  const [brightness, setBrightness] = useState(50);
  const [wifi, setWifi] = useState(true);
  const [bluetooth, setBluetooth] = useState(true);
  const [dnd, setDnd] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Real-time clock
  const [time, setTime] = useState(new Date());

  const t = (key: string) => getTranslation(config, key);

  // Fetch initial states
  useEffect(() => {
    if (window.electron) {
      window.electron.getVolume().then(v => setVolume(v));
      window.electron.getBrightness().then(b => setBrightness(b));
    }
  }, []);

  // Sync Volume with local state (Debounced for performance)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.electron) window.electron.setVolume(volume);
    }, 50); // Small debounce
    return () => clearTimeout(timer);
  }, [volume]);

  // Sync Brightness with local state (Debounced for performance)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.electron) window.electron.setBrightness(brightness);
    }, 50); // Small debounce
    return () => clearTimeout(timer);
  }, [brightness]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Handlers for Toggles
  const handleWifiToggle = async () => {
    if (window.electron) {
      const newState = !wifi;
      const success = await window.electron.toggleWifi(newState);
      if (success) setWifi(newState);
    }
  };

  const handleBluetoothToggle = async () => {
    if (window.electron) {
      const newState = !bluetooth;
      const success = await window.electron.toggleBluetooth(newState);
      if (success) setBluetooth(newState);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Click outside to close */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed z-50 w-[360px] bg-[#0f0f0f] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col p-6 select-none"
        style={{
          left: `calc(50% - 180px)`, // Center horizontally
          top: `calc(50% - 200px)`,  // Center vertically approx
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Time & Battery */}
        <div className="flex justify-between items-center mb-8 text-white/80">
          <div className="flex flex-col">
            <span className="text-3xl font-light tracking-tight">
              {time.toLocaleTimeString(config.language === 'pt' ? 'pt-BR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="text-xs text-white/40 uppercase tracking-widest font-medium">
              {time.toLocaleDateString(config.language === 'pt' ? 'pt-BR' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-2 text-white/60 bg-white/5 px-3 py-1 rounded-full border border-white/5">
            <span className="text-xs font-mono">84%</span>
            <Battery size={16} />
          </div>
        </div>

        {/* Sliders Section */}
        <div className="space-y-6 mb-8">
          {/* Volume */}
          <div className="group">
            <div className="flex justify-between text-xs text-white/50 mb-2 uppercase tracking-wider">
              <span className="flex items-center gap-2"><Volume2 size={12} /> {t('system.volume')}</span>
              <span className={volume < 0 ? 'text-red-400' : volume > 100 ? 'text-orange-400' : ''}>
                {volume < 0 ? `${Math.abs(volume)}% ${t('system.below_min')}` : volume > 100 ? `${volume}% ${t('system.above_max')}` : `${volume}%`}
              </span>
            </div>
            <div className="relative h-6 flex items-center">
              <input
                type="range"
                min="-50" max="150"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="z-10"
              />
              <div
                className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-white rounded-full pointer-events-none"
                style={{
                  width: `${Math.max(0, Math.min(100, volume))}%`,
                  backgroundColor: volume < 0 ? '#ef4444' : volume > 100 ? '#fb923c' : 'white'
                }}
              />
            </div>
          </div>

          {/* Brilho */}
          <div className="group">
            <div className="flex justify-between text-xs text-white/50 mb-2 uppercase tracking-wider">
              <span className="flex items-center gap-2"><Sun size={12} /> {t('system.brightness')}</span>
              <span className={brightness < 0 ? 'text-red-400' : brightness > 100 ? 'text-orange-400' : ''}>
                {brightness < 0 ? `${Math.abs(brightness)}% ${t('system.below_min')}` : brightness > 100 ? `${brightness}% ${t('system.above_max')}` : `${brightness}%`}
              </span>
            </div>
            <div className="relative h-6 flex items-center">
              <input
                type="range"
                min="-50" max="150"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="z-10"
              />
              <div
                className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-white rounded-full pointer-events-none"
                style={{
                  width: `${Math.max(0, Math.min(100, brightness))}%`,
                  backgroundColor: brightness < 0 ? '#ef4444' : brightness > 100 ? '#fb923c' : 'white'
                }}
              />
            </div>
          </div>
        </div>

        {/* Toggles Grid */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <ToggleBtn
            icon={Wifi}
            label="Wi-Fi"
            isActive={wifi}
            onClick={handleWifiToggle}
          />
          <ToggleBtn
            icon={Bluetooth}
            label="Bluetooth"
            isActive={bluetooth}
            onClick={handleBluetoothToggle}
          />
          <ToggleBtn
            icon={Moon}
            label={t('system.focus')}
            isActive={dnd}
            onClick={() => setDnd(!dnd)}
          />
        </div>

        {/* Media Player (Minimal) */}
        <div className="mt-auto bg-white/5 rounded-xl p-4 border border-white/5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
            <Music size={18} className="text-white" />
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="text-sm font-medium text-white truncate">Midnight City</div>
            <div className="text-xs text-white/40 truncate">M83 • Hurry Up, We're Dreaming</div>
          </div>
          <div className="flex gap-2">
            <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white/70">
              <SkipBack size={16} fill="currentColor" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 bg-white text-black rounded-full hover:scale-105 transition-transform"
            >
              {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
            </button>
            <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white/70">
              <SkipForward size={16} fill="currentColor" />
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
};

const ToggleBtn = ({ icon: Icon, label, isActive, onClick }: any) => (
  <button
    onClick={onClick}
    className={`
      flex flex-col items-center justify-center gap-2 py-4 rounded-xl border transition-all duration-200
      ${isActive
        ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]'
        : 'bg-[#141414] text-white/50 border-white/5 hover:bg-[#1a1a1a] hover:border-white/10'
      }
    `}
  >
    <Icon size={20} />
    <span className="text-[10px] uppercase font-semibold tracking-wider">{label}</span>
  </button>
);