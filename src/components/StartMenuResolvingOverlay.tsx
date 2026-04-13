import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { Language } from '../translations';
import { ZenithLogo } from './ZenithLogo';

const DISPLAY = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";

/** Cantos tipo viewfinder — alinhado com AlarmRingingOverlay. */
function CornerFrame() {
  const L = 18;
  const t = 'border-white/[0.12]';
  return (
    <>
      <div
        className={`pointer-events-none absolute left-5 top-5 border-l border-t ${t}`}
        style={{ width: L, height: L }}
      />
      <div
        className={`pointer-events-none absolute right-5 top-5 border-r border-t ${t}`}
        style={{ width: L, height: L }}
      />
      <div
        className={`pointer-events-none absolute bottom-5 left-5 border-b border-l ${t}`}
        style={{ width: L, height: L }}
      />
      <div
        className={`pointer-events-none absolute bottom-5 right-5 border-b border-r ${t}`}
        style={{ width: L, height: L }}
      />
    </>
  );
}

const COPY: Record<
  Language,
  { title: string; subtitle: string; hint: string; badge: string }
> = {
  pt: {
    title: 'A preparar o espaço Main',
    subtitle:
      'Estamos a ler o Menu Iniciar do Windows e a resgatar os seus atalhos para o menu radial.',
    hint: 'Não feche o Zenith durante este passo.',
    badge: 'Sincronização',
  },
  en: {
    title: 'Preparing your Main workspace',
    subtitle:
      "We're reading your Windows Start menu and gathering shortcuts for your radial menu.",
    hint: 'Please keep Zenith open during this step.',
    badge: 'Sync',
  },
  es: {
    title: 'Preparando el espacio principal',
    subtitle:
      'Estamos leyendo el menú Inicio de Windows y recuperando accesos directos para el menú radial.',
    hint: 'No cierre Zenith durante este paso.',
    badge: 'Sincronización',
  },
  fr: {
    title: 'Préparation de l’espace principal',
    subtitle:
      'Nous lisons le menu Démarrer Windows et récupérons vos raccourcis pour le menu radial.',
    hint: 'Ne fermez pas Zenith pendant cette étape.',
    badge: 'Synchronisation',
  },
  de: {
    title: 'Hauptbereich wird vorbereitet',
    subtitle:
      'Wir lesen das Windows-Startmenü und übernehmen Verknüpfungen für das Radialmenü.',
    hint: 'Bitte Zenith in diesem Schritt geöffnet lassen.',
    badge: 'Sync',
  },
  it: {
    title: 'Preparazione dello spazio Main',
    subtitle:
      'Stiamo leggendo il menu Start di Windows e recuperando le scorciatoie per il menu radiale.',
    hint: 'Non chiudere Zenith durante questo passaggio.',
    badge: 'Sincronizzazione',
  },
  ja: {
    title: 'メインスペースを準備しています',
    subtitle:
      'Windows のスタート メニューを読み取り、ラジアル メニュー用のショートカットを取得しています。',
    hint: 'この間は Zenith を閉じないでください。',
    badge: '同期',
  },
  zh: {
    title: '正在准备主工作区',
    subtitle: '正在读取 Windows 开始菜单并为径向菜单获取快捷方式。',
    hint: '请勿在此期间关闭 Zenith。',
    badge: '同步',
  },
  ko: {
    title: '메인 작업 공간 준비 중',
    subtitle:
      'Windows 시작 메뉴를 읽고 방사형 메뉴용 바로가기를 가져오는 중입니다.',
    hint: '이 단계에서 Zenith를 닫지 마세요.',
    badge: '동기화',
  },
  ru: {
    title: 'Подготовка основного пространства',
    subtitle:
      'Читаем меню «Пуск» Windows и собираем ярлыки для радиального меню.',
    hint: 'Не закрывайте Zenith на этом шаге.',
    badge: 'Синхронизация',
  },
};

function textFor(lang: Language) {
  return COPY[lang] ?? COPY.en;
}

type Props = {
  open: boolean;
  language: Language;
  /** Accent from UI settings — progress and highlights match the radial menu. */
  accentColor?: string;
};

export const StartMenuResolvingOverlay: React.FC<Props> = ({
  open,
  language,
  accentColor = '#FFFFFF',
}) => {
  const { title, subtitle, hint, badge } = textFor(language);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100000] flex flex-col items-center justify-center px-6 py-8 sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          {/* Fundo — mesma linguagem do WelcomeScreen */}
          <div className="absolute inset-0 z-0 bg-black" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              background:
                'radial-gradient(circle at center, #141414 0%, #050505 45%, #000000 100%)',
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 z-[1] opacity-[0.04]"
            style={{
              backgroundImage: `linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
            }}
          />

          <CornerFrame />

          <motion.div
            role="status"
            aria-live="polite"
            aria-busy="true"
            initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="relative z-[2] w-full max-w-lg"
            style={{ fontFamily: DISPLAY }}
          >
            <div className="relative overflow-hidden rounded-xl border border-white/20 bg-[#0A0A0A]/95 shadow-[0_0_120px_rgba(0,0,0,0.5)] backdrop-blur-xl">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

              <div className="px-8 pb-8 pt-9 sm:px-10 sm:pb-10 sm:pt-10">
                <div className="mb-6 flex flex-col items-center">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
                    <ZenithLogo size={56} />
                  </div>
                  <div className="mb-4 flex items-center gap-2 rounded-full border border-white/5 bg-white/5 px-3 py-1">
                    <div
                      className="h-1.5 w-1.5 shrink-0 rounded-full animate-pulse"
                      style={{ backgroundColor: accentColor, opacity: 0.85 }}
                    />
                    <span className="text-[10px] font-medium uppercase tracking-[0.35em] text-white/40">
                      {badge}
                    </span>
                  </div>
                </div>

                <div className="mb-6 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                <h2 className="mb-3 text-center text-xl font-light tracking-[0.12em] text-white sm:text-2xl">
                  {title}
                </h2>
                <p className="mx-auto max-w-[28rem] text-center text-sm leading-relaxed text-white/50">
                  {subtitle}
                </p>

                <div className="mt-8 rounded-lg border border-white/5 bg-[#050505]/50 px-4 py-4 sm:px-5">
                  <div className="flex items-center gap-4">
                    <Loader2
                      className="h-5 w-5 shrink-0 animate-spin"
                      style={{
                        animationDuration: '0.85s',
                        color: accentColor,
                        opacity: 0.8,
                      }}
                      aria-hidden
                    />
                    <div className="h-px flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                      <motion.div
                        className="h-px rounded-full"
                        style={{
                          width: '42%',
                          background: `linear-gradient(90deg, transparent, ${accentColor}66, ${accentColor}, ${accentColor}66, transparent)`,
                        }}
                        initial={{ x: '-120%' }}
                        animate={{ x: '280%' }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.5,
                          ease: 'linear',
                        }}
                      />
                    </div>
                  </div>
                </div>

                <p className="mt-6 text-center text-[9px] font-medium uppercase tracking-[0.22em] text-white/30">
                  {hint}
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
