import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Zap, Star } from 'lucide-react';
import { UIConfig } from '../types';
import { getTranslation } from '../translations';

interface PlansScreenProps {
    config: UIConfig;
}

const FREE_FEATURES = [
    'welcome.feature_radial_menu',
    'welcome.feature_workspaces_3',
    'welcome.feature_widgets',
    'welcome.feature_hud',
];

const PREMIUM_FEATURES = [
    'welcome.feature_radial_menu',
    'welcome.feature_workspaces_unlimited',
    'welcome.feature_widgets',
    'welcome.feature_hud',
    'welcome.feature_cloud_sync',
    'welcome.feature_themes',
    'welcome.feature_priority_support',
];

export const PlansScreen: React.FC<PlansScreenProps> = ({ config }) => {
    const [billing, setBilling] = useState<'monthly' | 'annual'>('annual');
    const t = (key: string) => getTranslation(config, key);

    const price = billing === 'monthly' ? t('plans.monthly_price') : t('plans.annual_price');

    return (
        <motion.div
            key="plans"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-full flex flex-col items-center gap-5 px-6 pb-8 pt-4"
        >
            {/* Billing Toggle */}
            <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/8 rounded-full">
                {(['monthly', 'annual'] as const).map((b) => (
                    <button
                        key={b}
                        onClick={() => setBilling(b)}
                        className={`relative px-5 py-1.5 rounded-full text-xs font-medium tracking-wide transition-all duration-200 ${
                            billing === b
                                ? 'bg-white text-black shadow'
                                : 'text-white/40 hover:text-white/70'
                        }`}
                    >
                        {t(`welcome.${b}`)}
                        {b === 'annual' && billing !== 'annual' && (
                            <span className="absolute -top-2 -right-2 bg-white text-black text-[8px] font-bold px-1.5 rounded-full leading-tight">
                                {t('plans.best_value')}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Plan Cards */}
            <div className="w-full grid grid-cols-2 gap-3">
                {/* Free Card */}
                <div className="relative flex flex-col gap-3 p-5 rounded-xl border border-white/8 bg-white/2">
                    <div>
                        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">{t('plans.free_plan_name')}</p>
                        <p className="text-2xl font-light text-white">$0<span className="text-sm text-white/30">/mo</span></p>
                    </div>
                    <div className="h-px w-full bg-white/5" />
                    <ul className="flex flex-col gap-2">
                        {FREE_FEATURES.map((key) => (
                            <li key={key} className="flex items-center gap-2 text-[11px] text-white/50">
                                <Check size={11} className="text-white/30 shrink-0" />
                                {t(key)}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Premium Card */}
                <div className="relative flex flex-col gap-3 p-5 rounded-xl border border-white/20 bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                    {/* Best Value Badge */}
                    {billing === 'annual' && (
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-white text-black text-[9px] font-bold px-3 py-0.5 rounded-full tracking-wide whitespace-nowrap"
                        >
                            {t('plans.best_value')}
                        </motion.div>
                    )}

                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <Star size={10} className="text-white/60" fill="currentColor" />
                            <p className="text-[10px] text-white/60 uppercase tracking-widest">{t('plans.premium_plan_name')}</p>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <AnimatePresence mode="wait">
                                <motion.p
                                    key={price}
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 6 }}
                                    transition={{ duration: 0.2 }}
                                    className="text-2xl font-light text-white"
                                >
                                    {price}
                                </motion.p>
                            </AnimatePresence>
                            <span className="text-sm text-white/30">/mo</span>
                        </div>
                        {billing === 'annual' && (
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-[9px] text-white/30 mt-0.5"
                            >
                                {t('plans.billed_annually')}
                            </motion.p>
                        )}
                    </div>

                    <div className="h-px w-full bg-white/8" />

                    <ul className="flex flex-col gap-2">
                        {PREMIUM_FEATURES.map((key) => (
                            <li key={key} className="flex items-center gap-2 text-[11px] text-white/80">
                                <Check size={11} className="text-white shrink-0" />
                                {t(key)}
                            </li>
                        ))}
                    </ul>

                    <button className="mt-auto w-full py-2.5 bg-white text-black text-xs font-bold rounded-lg hover:bg-white/90 active:scale-95 transition-all duration-150 tracking-wide">
                        {t('plans.subscribe')}
                    </button>
                </div>
            </div>

            {/* Features Headline */}
            <p className="text-[10px] text-white/20 text-center tracking-wider uppercase px-4">
                {t('plans.features_title')}
            </p>

            {/* Decorative dots */}
            <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                    <div key={i} className="w-1 h-1 rounded-full bg-white/10" />
                ))}
            </div>
        </motion.div>
    );
};
