import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Settings, MessageSquare,
    Crown, LogIn, Book, X, User, CreditCard, HelpCircle, CheckCircle2,
    MapPin, ImagePlus,
} from 'lucide-react';
import { ZenithLogo } from './ZenithLogo';
import { UIConfig, SubscriptionTier, UserProfile } from '../types';
import { getTranslation } from '../translations';
import {
    ZENITH_LAUNCHER_DOCS_URL,
    ZENITH_LAUNCHER_HELP_URL,
    ZENITH_LAUNCHER_PRICING_URL,
} from '../constants/siteUrls';
import { openExternalSiteUrl } from '../utils/openExternalSiteUrl';

interface WelcomeScreenProps {
    onOpenSettings: () => void;
    onClose: () => void;
    config: UIConfig;
    className?: string;
    user: UserProfile | null;
    onLogin: (provider: 'google' | 'email') => void;
    onLogout: () => void;
    onUserProfileUpdate?: (patch: Partial<UserProfile>) => void;
}

function planTierLabel(tier: SubscriptionTier | undefined, isPremium: boolean, t: (k: string) => string): string {
    if (tier === 'plus') return t('plans.plus_plan_name');
    if (tier === 'pro' || isPremium) return t('plans.pro_plan_name');
    return t('plans.free_plan_name');
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
    onOpenSettings,
    user,
    onLogin,
    onLogout,
    onClose,
    config,
    className,
    onUserProfileUpdate,
}) => {
    const [showLogin, setShowLogin] = useState(false);
    const [showFeedback, setShowFeedback] = useState(false);
    const [showFeedbackSignInHint, setShowFeedbackSignInHint] = useState(false);
    const [feedbackText, setFeedbackText] = useState('');
    const [feedbackSent, setFeedbackSent] = useState(false);

    const avatarFileRef = useRef<HTMLInputElement>(null);
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editAddress, setEditAddress] = useState('');
    const [editAvatarUrl, setEditAvatarUrl] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (!user || !showLogin) return;
        setEditName(user.name);
        setEditEmail(user.email);
        setEditAddress(user.address || '');
        setEditAvatarUrl(user.avatarUrl);
    }, [user, showLogin]);

    // Auth Helpers
    const isPremiumOrTrial = user ? (user.isPremium || (user.trialEndsAt && new Date(user.trialEndsAt) > new Date())) : false;

    const trialLocale = config.language === 'pt' ? 'pt-BR' : config.language === 'en' ? 'en-US' : undefined;

    const saveProfile = () => {
        if (!user || !onUserProfileUpdate) return;
        onUserProfileUpdate({
            name: editName.trim() || user.name,
            email: editEmail.trim() || user.email,
            address: editAddress.trim() || undefined,
            avatarUrl: editAvatarUrl,
        });
    };

    const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f || !f.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') setEditAvatarUrl(reader.result);
        };
        reader.readAsDataURL(f);
        e.target.value = '';
    };

    const handleLoginClick = (provider: 'google' | 'email') => {
        onLogin(provider);
        setShowLogin(false);
    };

    const handleFeedbackClick = () => {
        if (user) {
            setFeedbackText('');
            setFeedbackSent(false);
            setShowFeedback(true);
        } else {
            setShowFeedbackSignInHint(true);
        }
    };

    const closeFeedbackSignInHint = () => setShowFeedbackSignInHint(false);

    const openLoginFromFeedbackHint = () => {
        setShowFeedbackSignInHint(false);
        setShowLogin(true);
    };

    const closeFeedbackModal = () => {
        setShowFeedback(false);
        setFeedbackSent(false);
        setFeedbackText('');
    };

    const handleSendFeedback = () => {
        const trimmed = feedbackText.trim();
        if (!trimmed) return;
        setFeedbackSent(true);
    };

    const t = (key: string) => getTranslation(config, key);

    return (
        <div className={`absolute inset-0 z-0 flex min-h-0 w-full flex-col overflow-x-hidden overflow-y-auto custom-scrollbar select-none rounded-xl ${className || ''}`}>

            {/* BACKGROUND LAYERS */}
            <div className="pointer-events-none absolute inset-0 z-[-1]">
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
            <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-4 py-4 sm:px-6 sm:py-6">
            <AnimatePresence mode="wait">
                <motion.div
                    key="welcome-home"
                    initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="relative w-full min-w-[300px] max-h-full overflow-y-auto custom-scrollbar bg-[#0A0A0A]/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-[0_0_120px_rgba(0,0,0,0.5)] flex flex-col items-center text-center pointer-events-auto sm:w-[95%] sm:min-w-[400px] sm:max-w-lg"
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
                                    <span className="text-[10px] text-white/40 font-mono tracking-widest uppercase">{t('welcome.system_operational')}</span>
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
                                    <span className="text-[9px] text-white/30 tracking-[0.2em] font-medium group-hover:text-white/60">{t('welcome.open_menu')}</span>
                                </div>
                                <div className="p-4 sm:p-6 flex flex-col items-center gap-3 group cursor-help transition-colors hover:bg-white/5">
                                    <div className="w-8 h-10 border border-white/20 rounded-t-lg rounded-b-sm relative flex justify-center pt-1.5 transition-colors group-hover:border-white/50">
                                        <div className="w-1 h-3 bg-white/40 rounded-full" />
                                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[7px] font-bold border border-white/20 px-1 rounded bg-black text-white/80">2x</div>
                                    </div>
                                    <span className="text-[9px] text-white/30 tracking-[0.2em] font-medium group-hover:text-white/60">{t('welcome.adjustments')}</span>
                                </div>
                                <div className="p-4 sm:p-6 flex flex-col items-center gap-3 group cursor-help transition-colors hover:bg-white/5">
                                    <div className="h-10 flex items-center justify-center gap-1">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className="w-6 h-6 rounded border border-white/20 flex items-center justify-center text-[10px] text-white/50 font-mono bg-white/5">{i}</div>
                                        ))}
                                    </div>
                                    <span className="text-[9px] text-white/30 tracking-[0.2em] font-medium group-hover:text-white/60">{t('welcome.workspaces')}</span>
                                </div>
                    </div>
                    <div className="w-full border-t border-white/5 bg-[#080808]/90 px-4 py-4 sm:px-6">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 max-w-xl mx-auto w-full">
                                    <div className="flex items-start gap-3 text-left min-w-0">
                                        <HelpCircle className="w-5 h-5 text-white/45 shrink-0 mt-0.5" aria-hidden />
                                        <div>
                                            <p className="text-[10px] font-semibold text-white/85 tracking-[0.12em] uppercase">
                                                {t('welcome.help_section_title')}
                                            </p>
                                            <p className="text-[11px] text-white/45 mt-1.5 leading-relaxed">
                                                {t('welcome.help_section_desc')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => openExternalSiteUrl(ZENITH_LAUNCHER_HELP_URL)}
                                            className="rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2.5 text-xs font-medium text-white/90 transition-colors"
                                        >
                                            {t('welcome.help_open_site')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openExternalSiteUrl(ZENITH_LAUNCHER_DOCS_URL)}
                                            className="rounded-lg border border-white/10 bg-transparent hover:bg-white/5 px-4 py-2.5 text-xs font-medium text-white/70 hover:text-white/90 transition-colors"
                                        >
                                            {t('welcome.docs_open_site')}
                                        </button>
                                    </div>
                                </div>
                    </div>
                </motion.div>
            </AnimatePresence>
            </div>

            {/* BOTTOM: ACTION DOCK */}
            <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="sticky bottom-0 z-20 mx-auto w-max max-w-[calc(100%-1.5rem)] shrink-0 px-2 pb-4 pt-2 pointer-events-auto"
            >
                <div className="flex items-center gap-3 p-2 bg-[#0A0A0A]/60 border border-white/10 rounded-2xl shadow-2xl flex-wrap justify-center min-w-fit">

                    {/* Profile / Auth Button */}
                    <DockButton
                        onClick={() => setShowLogin(true)}
                        active={!!user}
                        label={user ? user.name : t('welcome.sign_in')}
                        subLabel={user ? (isPremiumOrTrial ? t('welcome.pro') : t('welcome.free')) : t('welcome.free_trial')}
                    >
                        {user ? (
                            <User size={20} />
                        ) : (
                            <LogIn size={20} />
                        )}
                    </DockButton>

                    <div className="w-px h-6 bg-white/10 mx-1" />

                    <DockButton onClick={onOpenSettings} label={t('sidebar.interface')} icon={Settings} />
                    <DockButton
                        onClick={() => openExternalSiteUrl(ZENITH_LAUNCHER_HELP_URL)}
                        label={t('welcome.help')}
                        icon={Book}
                    />
                    <DockButton onClick={handleFeedbackClick} label={t('welcome.feedback')} icon={MessageSquare} />

                    <div className="w-px h-6 bg-white/10 mx-1" />

                    <DockButton
                        onClick={() => openExternalSiteUrl(ZENITH_LAUNCHER_PRICING_URL)}
                        label={t('welcome.plans')}
                        icon={CreditCard}
                        active={false}
                    />

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
                            className="bg-[#0A0A0A] border border-white/10 p-8 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto custom-scrollbar shadow-2xl relative overflow-x-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Glow effect */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-light text-white">{t('welcome.my_account')}</h3>
                                <button onClick={() => setShowLogin(false)} className="text-white/40 hover:text-white"><X size={20} /></button>
                            </div>

                            {user ? (
                                <div className="text-left space-y-6">
                                    <div className="rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-500/[0.12] via-fuchsia-500/[0.06] to-transparent px-4 py-3.5">
                                        <p className="text-[10px] font-semibold text-white/50 uppercase tracking-[0.15em] mb-2">
                                            {t('welcome.account_plan_section')}
                                        </p>
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/40 border border-white/10">
                                                <Crown className={`h-5 w-5 ${isPremiumOrTrial ? 'text-amber-300' : 'text-white/35'}`} fill={isPremiumOrTrial ? 'currentColor' : 'none'} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-white font-medium">
                                                    {planTierLabel(user.planTier, user.isPremium, t)}
                                                </p>
                                                {isPremiumOrTrial && user.trialEndsAt && (
                                                    <p className="text-[11px] text-white/45 mt-1">
                                                        {t('welcome.account_trial_until')}{' '}
                                                        {new Date(user.trialEndsAt).toLocaleDateString(trialLocale, {
                                                            day: 'numeric',
                                                            month: 'short',
                                                            year: 'numeric',
                                                        })}
                                                    </p>
                                                )}
                                                {!isPremiumOrTrial && (
                                                    <p className="text-[11px] text-white/40 mt-1">{t('welcome.free')}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[10px] font-semibold text-white/50 uppercase tracking-[0.15em] mb-3">
                                            {t('welcome.account_profile_section')}
                                        </p>
                                        <div className="flex flex-col sm:flex-row gap-4 items-start">
                                            <div className="relative shrink-0 mx-auto sm:mx-0">
                                                <div className="w-24 h-24 rounded-2xl overflow-hidden border border-white/15 bg-white/5 shadow-lg">
                                                    {editAvatarUrl ? (
                                                        <img src={editAvatarUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-white/30">
                                                            <User size={40} />
                                                        </div>
                                                    )}
                                                </div>
                                                <input
                                                    ref={avatarFileRef}
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={onAvatarFile}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => avatarFileRef.current?.click()}
                                                    className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 border border-white/20 text-white/90 hover:bg-white/20"
                                                    aria-label={t('welcome.profile_change_photo')}
                                                >
                                                    <ImagePlus size={15} />
                                                </button>
                                            </div>
                                            <div className="flex-1 w-full space-y-3 min-w-0">
                                                <label className="block">
                                                    <span className="text-[11px] text-white/45">{t('welcome.profile_display_name')}</span>
                                                    <input
                                                        value={editName}
                                                        onChange={e => setEditName(e.target.value)}
                                                        className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span className="text-[11px] text-white/45">{t('welcome.profile_email')}</span>
                                                    <input
                                                        type="email"
                                                        value={editEmail}
                                                        onChange={e => setEditEmail(e.target.value)}
                                                        className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span className="flex items-center gap-1.5 text-[11px] text-white/45">
                                                        <MapPin size={12} className="opacity-60" aria-hidden />
                                                        {t('welcome.profile_address')}
                                                    </span>
                                                    <textarea
                                                        value={editAddress}
                                                        onChange={e => setEditAddress(e.target.value)}
                                                        placeholder={t('welcome.profile_address_placeholder')}
                                                        rows={2}
                                                        className="mt-1 w-full resize-none rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-white/35 mt-3 leading-relaxed">{t('welcome.profile_local_hint')}</p>
                                    </div>

                                    <div className="flex flex-col gap-2 pt-1">
                                        {onUserProfileUpdate && (
                                            <button
                                                type="button"
                                                onClick={saveProfile}
                                                className="w-full py-2.5 text-sm font-medium rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:brightness-110 transition-[filter]"
                                            >
                                                {t('welcome.profile_save')}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={onLogout}
                                            className="w-full py-2 text-sm text-red-400/95 hover:bg-red-500/10 rounded-lg transition-colors"
                                        >
                                            {t('welcome.sign_out')}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p className="text-white/50 text-sm mb-4 leading-relaxed">
                                        {t('welcome.login_sync_desc')}
                                    </p>
                                    <div
                                        className="mb-6 rounded-xl border border-amber-400/25 bg-gradient-to-br from-amber-500/[0.12] via-violet-600/[0.08] to-transparent px-4 py-3.5 text-left shadow-[0_0_24px_rgba(251,191,36,0.06)]"
                                        role="status"
                                        aria-live="polite"
                                    >
                                        <div className="flex gap-3">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-400/20">
                                                <Crown className="h-4 w-4 text-amber-300" aria-hidden />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-white tracking-tight">
                                                    {t('welcome.google_pro_trial_title')}
                                                </p>
                                                <p className="text-[12px] text-white/65 mt-1.5 leading-relaxed">
                                                    {t('welcome.google_pro_trial_desc')}
                                                </p>
                                                <p className="text-[11px] text-white/45 mt-2 leading-relaxed border-t border-white/10 pt-2">
                                                    {t('welcome.trial_downgrade_note')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <button
                                            onClick={() => handleLoginClick('google')}
                                            className="w-full py-3 bg-white text-black font-medium rounded-lg flex items-center justify-center gap-3 hover:bg-gray-200 transition-colors"
                                        >
                                            <img src="https://www.google.com/favicon.ico" alt="" className="w-4 h-4" /> {t('welcome.google_login')}
                                        </button>
                                        <button
                                            onClick={() => handleLoginClick('email')}
                                            className="w-full py-3 bg-[#222] text-white font-medium rounded-lg flex items-center justify-center gap-3 hover:bg-[#333] transition-colors border border-white/5"
                                        >
                                            <LogIn size={16} /> {t('welcome.email_login')}
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Feedback requires sign-in — same shell as login / feedback modals */}
            <AnimatePresence>
                {showFeedbackSignInHint && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-8 pointer-events-auto bg-black/50 backdrop-blur-[2px]"
                        onClick={closeFeedbackSignInHint}
                    >
                        <motion.div
                            initial={{ scale: 0.94, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.94, opacity: 0, y: 16 }}
                            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                            className="bg-[#0A0A0A] border border-white/10 p-8 rounded-2xl w-full max-w-md shadow-[0_0_80px_rgba(0,0,0,0.65)] relative overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

                            <div className="flex justify-between items-start gap-4 mb-6">
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                                        <LogIn className="h-[18px] w-[18px] text-white/80" strokeWidth={1.5} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-light text-white tracking-tight">{t('welcome.feedback')}</h3>
                                        <p className="text-white/45 text-xs mt-1 leading-relaxed">{t('welcome.feedback_desc')}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeFeedbackSignInHint}
                                    className="text-white/35 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors shrink-0"
                                    aria-label={t('welcome.cancel')}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <p className="text-sm text-white/70 leading-relaxed mb-6">{t('welcome.sign_in_hint')}</p>

                            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
                                <button
                                    type="button"
                                    onClick={closeFeedbackSignInHint}
                                    className="w-full sm:w-auto px-5 py-2.5 text-sm text-white/55 hover:text-white hover:bg-white/5 rounded-lg border border-transparent transition-colors"
                                >
                                    {t('welcome.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={openLoginFromFeedbackHint}
                                    className="w-full sm:w-auto px-6 py-2.5 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                                >
                                    <LogIn size={16} />
                                    {t('welcome.sign_in')}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* FEEDBACK MODAL — same shell as login (accent bar, header + X, Zenith dark UI) */}
            <AnimatePresence>
                {showFeedback && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-8 pointer-events-auto bg-black/50 backdrop-blur-[2px]"
                        onClick={closeFeedbackModal}
                    >
                        <motion.div
                            initial={{ scale: 0.94, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.94, opacity: 0, y: 16 }}
                            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                            className="bg-[#0A0A0A] border border-white/10 p-8 rounded-2xl w-full max-w-md shadow-[0_0_80px_rgba(0,0,0,0.65)] relative overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

                            {!feedbackSent ? (
                                <>
                                    <div className="flex justify-between items-start gap-4 mb-6">
                                        <div className="flex items-start gap-3 min-w-0">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                                                <MessageSquare className="h-[18px] w-[18px] text-white/80" strokeWidth={1.5} />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-light text-white tracking-tight">{t('welcome.feedback')}</h3>
                                                <p className="text-white/45 text-xs mt-1 leading-relaxed">{t('welcome.feedback_desc')}</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={closeFeedbackModal}
                                            className="text-white/35 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors shrink-0"
                                            aria-label={t('welcome.cancel')}
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <textarea
                                        value={feedbackText}
                                        onChange={e => setFeedbackText(e.target.value)}
                                        className="w-full min-h-[140px] bg-[#050505] border border-white/10 rounded-xl p-3.5 text-white text-sm leading-relaxed mb-5 resize-none focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10 placeholder:text-white/25"
                                        placeholder={t('welcome.feedback_placeholder')}
                                        autoFocus
                                    />

                                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
                                        <button
                                            type="button"
                                            onClick={closeFeedbackModal}
                                            className="w-full sm:w-auto px-5 py-2.5 text-sm text-white/55 hover:text-white hover:bg-white/5 rounded-lg border border-transparent transition-colors"
                                        >
                                            {t('welcome.cancel')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSendFeedback}
                                            disabled={!feedbackText.trim()}
                                            className="w-full sm:w-auto px-6 py-2.5 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-35 disabled:pointer-events-none"
                                        >
                                            {t('welcome.send')}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="relative text-center pt-1">
                                    <button
                                        type="button"
                                        onClick={closeFeedbackModal}
                                        className="absolute -top-1 -right-1 text-white/35 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                                        aria-label={t('welcome.cancel')}
                                    >
                                        <X size={20} />
                                    </button>
                                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] mb-5">
                                        <CheckCircle2 className="h-8 w-8 text-white/90" strokeWidth={1.25} />
                                    </div>
                                    <p className="text-white text-[15px] font-medium leading-snug mb-8 px-2">{t('welcome.thanks_feedback')}</p>
                                    <button
                                        type="button"
                                        onClick={closeFeedbackModal}
                                        className="w-full py-3 bg-white text-black font-medium rounded-lg text-sm hover:bg-gray-200 transition-colors"
                                    >
                                        {t('welcome.feedback_close')}
                                    </button>
                                </div>
                            )}
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