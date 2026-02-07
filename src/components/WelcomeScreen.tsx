import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Play, Settings, MessageSquare,
    Crown, LogIn, Command, Book, X, User
} from 'lucide-react';
import { ZenithLogo } from './ZenithLogo';
import { UIConfig, UserProfile } from '../types';

interface WelcomeScreenProps {
    onOpenSettings: () => void;
    onClose: () => void;
    config: UIConfig;
    className?: string;
    user: UserProfile | null;
    onLogin: (provider: 'google' | 'email') => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
    onOpenSettings,
    user,
    onLogin,
    onClose,
    config,
    className
}) => {
    const [showLogin, setShowLogin] = useState(false);
    const [showFeedback, setShowFeedback] = useState(false);

    // Auth Helpers
    const isPremiumOrTrial = user ? (user.isPremium || (user.trialEndsAt && new Date(user.trialEndsAt) > new Date())) : false;

    const handleLoginClick = (provider: 'google' | 'email') => {
        onLogin(provider);
        setShowLogin(false);
    };

    const handleFeedbackClick = () => {
        if (user) {
            setShowFeedback(true);
        } else {
            alert("Please sign in or register to send feedback.");
            setShowLogin(true);
        }
    };

    return (
        <div className={`fixed inset-0 w-screen h-screen z-0 grid place-items-center p-8 select-none border-4 border-white/5 ${className || ''}`}>

            {/* BACKGROUND LAYERS */}
            <div className="absolute inset-0 z-[-1] pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#141414] via-[#050505] to-[#000000]" />
                <div
                    className="absolute inset-0 opacity-[0.04]"
                    style={{
                        backgroundImage: `linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)`,
                        backgroundSize: '40px 40px'
                    }}
                />
            </div>

            {/* CENTRAL APP WIDGET (LAUNCHER CARD) */}
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
                className="relative z-10 w-full sm:w-[90%] max-w-lg min-w-[300px] sm:min-w-[400px] max-h-[90vh] overflow-y-auto custom-scrollbar bg-[#0A0A0A]/80 backdrop-blur-xl border border-white/20 rounded-xl shadow-[0_0_120px_rgba(0,0,0,0.5)] flex flex-col items-center text-center pointer-events-auto"
            >
                {/* Top Glow */}
                <div className="absolute top-0 w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />


                <div className="p-6 sm:p-10 pb-8 flex flex-col items-center w-full">
                    {/* Logo */}
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-black rounded-2xl flex items-center justify-center mb-6 shadow-2xl overflow-hidden border border-white/10">
                        <ZenithLogo size={70} />
                    </div>

                    {/* Title */}
                    <h1 className="text-3xl sm:text-4xl font-light tracking-[0.25em] text-white mb-2 pl-2">ZENITH</h1>

                    {/* Version Badge */}
                    <div className="flex items-center gap-2 bg-white/5 border border-white/5 rounded-full px-3 py-1 mb-6">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-[10px] text-white/40 font-mono tracking-widest uppercase">System Operational v1.2</span>
                    </div>

                    {/* Divider */}
                    <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-2" />
                </div>

                {/* Instructions Grid (HUD) */}
                <div className="w-full bg-[#050505]/50 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/5 border-t border-white/5 overflow-hidden">
                    <div className="p-4 sm:p-6 flex flex-col items-center gap-3 group cursor-help transition-colors hover:bg-white/5">
                        <div className="w-8 h-10 border border-white/20 rounded-t-lg rounded-b-sm relative flex justify-center pt-1.5 transition-colors group-hover:border-white/50">
                            <div className="w-1 h-3 bg-white/40 rounded-full" />
                        </div>
                        <span className="text-[9px] text-white/30 tracking-[0.2em] font-medium group-hover:text-white/60">LAUNCH</span>
                    </div>
                    <div className="p-4 sm:p-6 flex flex-col items-center gap-3 group cursor-help transition-colors hover:bg-white/5">
                        <div className="w-8 h-10 border border-white/20 rounded-t-lg rounded-b-sm relative flex justify-center pt-1.5 transition-colors group-hover:border-white/50">
                            <div className="w-1 h-3 bg-white/40 rounded-full" />
                            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[7px] font-bold border border-white/20 px-1 rounded bg-black text-white/80">2x</div>
                        </div>
                        <span className="text-[9px] text-white/30 tracking-[0.2em] font-medium group-hover:text-white/60">CONFIG</span>
                    </div>
                    <div className="p-4 sm:p-6 flex flex-col items-center gap-3 group cursor-help transition-colors hover:bg-white/5">
                        <div className="h-10 flex items-center justify-center gap-1">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="w-6 h-6 rounded border border-white/20 flex items-center justify-center text-[10px] text-white/50 font-mono bg-white/5">{i}</div>
                            ))}
                        </div>
                        <span className="text-[9px] text-white/30 tracking-[0.2em] font-medium group-hover:text-white/60">WORKSPACES</span>
                    </div>
                </div>
            </motion.div>

            {/* BOTTOM: ACTION DOCK */}
            <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="fixed bottom-12 pointer-events-auto min-w-fit z-20"
            >
                <div className="flex items-center gap-3 p-2 bg-[#0A0A0A]/60 border border-white/10 rounded-2xl shadow-2xl flex-wrap justify-center min-w-fit">

                    {/* Profile / Auth Button */}
                    <DockButton
                        onClick={() => setShowLogin(true)}
                        active={!!user}
                        label={user ? user.name : "Sign In"}
                        subLabel={user ? (isPremiumOrTrial ? "Pro" : "Free") : "Get Trial"}
                    >
                        {user ? (
                            <User size={20} />
                        ) : (
                            <LogIn size={20} />
                        )}
                    </DockButton>

                    <div className="w-px h-6 bg-white/10 mx-1" />

                    <DockButton onClick={onOpenSettings} label="Settings" icon={Settings} />
                    <DockButton onClick={onClose} label="Done" icon={Command} />
                    <DockButton onClick={() => window.open('https://docs.zenith-os.com', '_blank')} label="Docs" icon={Book} />
                    <DockButton onClick={handleFeedbackClick} label="Feedback" icon={MessageSquare} />

                </div>
            </motion.div>


            {/* --- MODALS (Local to this screen) --- */}

            {/* LOGIN MODAL */}
            <AnimatePresence>
                {showLogin && (
                    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-8 pointer-events-auto" onClick={() => setShowLogin(false)}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-[#0A0A0A] border border-white/10 p-8 rounded-2xl w-full max-w-sm shadow-2xl relative overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Glow effect */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-light text-white">Zenith ID</h3>
                                <button onClick={() => setShowLogin(false)} className="text-white/40 hover:text-white"><X size={20} /></button>
                            </div>

                            {user ? (
                                <div className="text-center space-y-6">
                                    <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white shadow-xl">
                                        <User size={32} />
                                    </div>
                                    <div>
                                        <h2 className="text-white text-lg font-medium">{user.name}</h2>
                                        <p className="text-white/40 text-sm">{user.email}</p>
                                    </div>
                                    <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                                        {isPremiumOrTrial ? (
                                            <div className="flex items-center justify-center gap-2 text-yellow-500">
                                                <Crown size={16} fill="currentColor" />
                                                <span className="text-xs font-bold uppercase">Zenith Pro Active</span>
                                            </div>
                                        ) : (
                                            <div className="text-xs text-white/50">Free Plan</div>
                                        )}
                                    </div>
                                    <button className="w-full py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">Sign Out</button>
                                </div>
                            ) : (
                                <>
                                    <p className="text-white/50 text-sm mb-6 leading-relaxed">
                                        Sign in to sync your layout across devices and unlock the <span className="text-white font-medium">7-day Pro Trial</span>.
                                    </p>
                                    <div className="space-y-3">
                                        <button
                                            onClick={() => handleLoginClick('google')}
                                            className="w-full py-3 bg-white text-black font-medium rounded-lg flex items-center justify-center gap-3 hover:bg-gray-200 transition-colors"
                                        >
                                            <img src="https://www.google.com/favicon.ico" className="w-4 h-4" /> Continue with Google
                                        </button>
                                        <button
                                            onClick={() => handleLoginClick('email')}
                                            className="w-full py-3 bg-[#222] text-white font-medium rounded-lg flex items-center justify-center gap-3 hover:bg-[#333] transition-colors border border-white/5"
                                        >
                                            <LogIn size={16} /> Continue with Email
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* FEEDBACK MODAL */}
            <AnimatePresence>
                {showFeedback && (
                    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-8 pointer-events-auto" onClick={() => setShowFeedback(false)}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-[#0A0A0A] border border-white/10 p-6 rounded-2xl w-full max-w-md shadow-2xl relative"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 to-blue-500" />
                            <h3 className="text-xl text-white mb-1 font-light">Feedback</h3>
                            <p className="text-white/40 text-xs mb-4">Help us improve Zenith. Bug reports and feature requests are welcome.</p>

                            <textarea
                                className="w-full h-32 bg-[#141414] border border-white/10 rounded-lg p-3 text-white text-sm mb-4 resize-none focus:border-white/30 outline-none placeholder:text-white/20"
                                placeholder="Describe your experience..."
                                autoFocus
                            />
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setShowFeedback(false)} className="px-4 py-2 text-white/50 hover:text-white text-sm transition-colors">Cancel</button>
                                <button onClick={() => { setShowFeedback(false); alert("Feedback sent!"); }} className="px-6 py-2 bg-white text-black rounded-lg text-sm font-bold hover:scale-105 transition-transform">Send</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

        </div>
    );
};

// Helper for the Bottom Dock
const DockButton = ({ onClick, label, icon: Icon, children, active, subLabel }: any) => {
    const [hover, setHover] = useState(false);

    return (
        <div className="relative flex flex-col items-center group">
            {/* Tooltip */}
            <AnimatePresence>
                {hover && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: -10 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full mb-3 px-3 py-1.5 bg-[#141414] border border-white/10 rounded-lg whitespace-nowrap z-50 pointer-events-none shadow-xl"
                    >
                        <div className="text-xs font-bold text-white text-center">{label}</div>
                        {subLabel && <div className="text-[10px] text-white/50 text-center">{subLabel}</div>}
                        {/* Triangle Arrow */}
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#141414] border-r border-b border-white/10 rotate-45"></div>
                    </motion.div>
                )}
            </AnimatePresence>

            <button
                onClick={onClick}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                className={`
                    w-12 h-12 rounded-xl flex items-center justify-center border transition-all duration-200 overflow-hidden
                    ${active
                        ? 'border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.15)] bg-white/5'
                        : 'bg-transparent border-transparent text-white/50 hover:text-white hover:bg-white/10 hover:border-white/20 hover:scale-110 hover:-translate-y-1'
                    }
                `}
            >
                {children ? children : <Icon size={20} />}
            </button>
        </div>
    )
}