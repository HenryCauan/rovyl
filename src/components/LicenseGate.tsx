import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { UIConfig } from '../types';
import { computeRadialLayout, radialScrimGradient, snapToDevicePixel } from './RadialMenu';

/**
 * A roda trancada segue a gramática do radial, e é dela que sai o desenho deste ecrã:
 *
 *  · o CENTRO é a ação meta — fechar, voltar, e aqui destrancar. Nunca é um item da roda;
 *  · as FATIAS são escolhas; sem licença não há escolhas, logo o anel é só estado (trancado);
 *  · a PÍLULA de baixo é contexto e diz o que o gesto atual faz;
 *  · confirma-se pelo GESTO — apontar e largar/clicar em qualquer sítio, não acertar no alvo.
 *
 * Ativar não é um botão colado ao fundo nem uma fatia: é o centro, onde o cursor já está quando a
 * roda abre e onde a zona morta dá um alvo enorme. O anel fica inerte e sem rótulos — estado não
 * se anuncia com texto, e eram esses rótulos que se cruzavam com o que está por baixo no ecrã.
 */
const LOCKED_SLICE_COUNT = 3;

/** O radial só confirma um MMB depois desta janela — largar cedo demais lê-se como clique falhado. */
const MMB_GRACE_PERIOD_MS = 250;

function normalizeHoverColor(value?: string): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? '') ? value!.toUpperCase() : '#FFFFFF';
}

function getReadableForeground(background: string): '#000000' | '#FFFFFF' {
  const hex = background.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return '#000000';
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.56 ? '#000000' : '#FFFFFF';
}

export function LicenseGate({
  onOpenLicenseSettings,
  onDismiss,
  position,
  config,
  viewportSize,
  triggerSource,
  animationReady = true,
}: {
  /** Fecha a roda e abre as definições já no cartão da licença. */
  onOpenLicenseSettings: () => void;
  /** Centro do radial fecha a roda — aqui fecha o gate, pelo mesmo gesto. */
  onDismiss: () => void;
  position: { x: number; y: number };
  config: UIConfig;
  viewportSize: { width: number; height: number };
  /** `mmb` = aberto a segurar o botão do meio: confirma-se ao largar, como no radial. */
  triggerSource?: 'mmb' | 'mmb-click' | 'shortcut';
  /** False enquanto o HWND oculto recebe o primeiro paint transparente — igual ao RadialMenu. */
  animationReady?: boolean;
}) {
  const [bloom, setBloom] = useState(false);
  /** Alvo apontado pelo cursor — por ângulo, como no radial, não por hover do elemento. */
  const [aimed, setAimed] = useState<number | 'hub' | null>(null);
  const openedAtRef = useRef(Date.now());
  const aimedRef = useRef<number | 'hub' | null>(null);
  aimedRef.current = aimed;

  /** Mesma abertura do radial: um frame no estado recolhido, depois a expansão em CSS. */
  useEffect(() => {
    setBloom(false);
    if (!animationReady) return;
    openedAtRef.current = Date.now();
    const raf = requestAnimationFrame(() => setBloom(true));
    return () => cancelAnimationFrame(raf);
  }, [animationReady]);

  const { actualMenuRadius, actualIconSize } = React.useMemo(
    () =>
      computeRadialLayout({
        numberOfApps: LOCKED_SLICE_COUNT,
        iconSizePx: config.iconSize || 64,
        minGap: config.appSpacing || 0,
        menuRadius: config.menuRadius,
        activationThreshold: config.activationThreshold,
        viewportSize,
      }),
    [config.iconSize, config.appSpacing, config.menuRadius, config.activationThreshold, viewportSize],
  );

  /**
   * Seleção por ângulo: a fatia apontada acende mesmo com o cursor no outro extremo do ecrã, e a
   * zona morta central devolve o alvo ao hub. rAF porque um `mousemove` a 1000 Hz não pode disparar
   * um render por evento.
   */
  useEffect(() => {
    if (!bloom) return;
    let rafId: number | null = null;
    let last: MouseEvent | null = null;

    const process = () => {
      rafId = null;
      if (!last) return;
      const deltaX = last.clientX - position.x;
      const deltaY = last.clientY - position.y;

      /** Cobre a caixa do hub, não a circunferência — ver a mesma regra no RadialMenu. */
      const deadZone = Math.max(
        config.activationThreshold ?? 60,
        Math.ceil(((Math.round(actualIconSize * 1.2) & ~1) / 2) * 1.06 * Math.SQRT2) + 4,
      );
      if (Math.hypot(deltaX, deltaY) < deadZone) {
        setAimed('hub');
        return;
      }
      let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 90;
      if (angle < 0) angle += 360;
      const sliceAngle = 360 / LOCKED_SLICE_COUNT;
      setAimed(Math.floor(((angle + sliceAngle / 2) % 360) / sliceAngle));
    };

    const onMove = (event: MouseEvent) => {
      last = event;
      if (rafId === null) rafId = requestAnimationFrame(process);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [bloom, position.x, position.y, config.activationThreshold, actualIconSize]);

  /** Apontar e largar/clicar: o alvo é a direção, não o pixel — como confirmar uma fatia no radial. */
  const confirmAim = React.useCallback(() => {
    /** Centro destranca; o anel está inerte, portanto largar sobre ele é o mesmo que desistir. */
    if (aimedRef.current === 'hub') {
      onOpenLicenseSettings();
      return;
    }
    onDismiss();
  }, [onDismiss, onOpenLicenseSettings]);

  /**
   * Com o botão do meio premido o Windows retém a captura na janela que recebeu o clique: esta não
   * vê `mousemove` nenhum. O main sonda o cursor e nós reproduzimo-lo como evento real, para a mira
   * usar exatamente o mesmo pipeline — igual ao RadialMenu.
   */
  useEffect(() => {
    if (!bloom || triggerSource !== 'mmb' || !window.electron?.onMmbCursor) return;
    const cleanup = window.electron.onMmbCursor(({ x, y }) => {
      window.dispatchEvent(
        new MouseEvent('mousemove', { clientX: x - window.screenX, clientY: y - window.screenY }),
      );
    });
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [bloom, triggerSource]);

  useEffect(() => {
    if (!bloom || triggerSource !== 'mmb' || !window.electron?.onMmbRelease) return;
    let graceTimer: number | undefined;

    const onRelease = () => {
      const elapsed = Date.now() - openedAtRef.current;
      if (elapsed < MMB_GRACE_PERIOD_MS) {
        graceTimer = window.setTimeout(confirmAim, MMB_GRACE_PERIOD_MS - elapsed);
        return;
      }
      confirmAim();
    };

    const cleanup = window.electron.onMmbRelease(onRelease);
    return () => {
      if (typeof cleanup === 'function') cleanup();
      if (graceTimer !== undefined) window.clearTimeout(graceTimer);
    };
  }, [bloom, triggerSource, confirmAim]);

  const minGap = config.appSpacing || 0;
  const backdropRadius = Math.ceil(actualMenuRadius + actualIconSize * 0.75 + Math.max(18, minGap));
  const overlayDim = React.useMemo(
    () => radialScrimGradient(position, config.backdropOpacity, backdropRadius),
    [position.x, position.y, config.backdropOpacity, backdropRadius],
  );

  const hoverColor = normalizeHoverColor(config.radialHoverColor);
  const hoverForeground = getReadableForeground(hoverColor);
  const hubAimed = aimed === 'hub';
  /** Lado par: `translate(-50%)` de um ímpar cai em meio-pixel e serrilha o círculo. */
  const hubSize = Math.round(actualIconSize * 1.2) & ~1;
  const pillOffset = Math.round(actualMenuRadius + actualIconSize * 0.75 + 34);

  return (
    <div
      data-zenith-radial-modal="true"
      className={`fixed inset-0 z-[90] ${config.performanceMode ? 'zn-radial--fast' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Rovyl is locked"
      /** Clique em qualquer sítio confirma o que está apontado — o alvo é a direção, não o pixel. */
      onClick={confirmAim}
    >
      <div
        className="zn-radial-scrim fixed inset-0 z-[2]"
        style={{
          background: overlayDim,
          ['--zn-op' as string]: bloom ? 1 : 0,
          ['--zn-dur-op' as string]: '150ms',
          willChange: 'opacity',
        }}
      />

      <div
        className="fixed z-[10]"
        style={{ left: Math.round(position.x), top: Math.round(position.y), width: 0, height: 0 }}
      >
        {/* Hub — a peça central do radial, aqui a ação meta: destrancar. */}
        <div
          className={`zn-radial-hub absolute top-0 left-0 flex items-center justify-center rounded-full z-20 ${hubAimed ? '' : 'text-white/70'}`}
          style={{
            width: `${hubSize}px`,
            height: `${hubSize}px`,
            /** Sem anel: o disco define-se pelo preenchimento — ver a mesma nota no RadialMenu. */
            backgroundColor: hubAimed ? hoverColor : 'rgba(6,7,9,0.90)',
            border: 'none',
            color: hubAimed ? hoverForeground : undefined,
            boxShadow: hubAimed
              ? `0 0 22px ${hoverColor}3d, 0 8px 22px rgba(0,0,0,0.55)`
              : '0 1px 3px rgba(0,0,0,0.55), 0 8px 20px rgba(0,0,0,0.5)',
            ['--zn-tf' as string]: `translate(-50%, -50%) scale(${bloom ? (hubAimed ? 1.06 : 1) : 0.82})`,
            ['--zn-op' as string]: bloom ? 1 : 0,
            ['--zn-dur' as string]: '130ms',
          }}
        >
          {/* Anel em SVG, pelo mesmo motivo do RadialMenu: um caminho vetorial em vez de borda CSS. */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={hubSize}
            height={hubSize}
            viewBox={`0 0 ${hubSize} ${hubSize}`}
            shapeRendering="geometricPrecision"
            aria-hidden
          >
            <circle
              cx={hubSize / 2}
              cy={hubSize / 2}
              r={(hubSize - 1.5) / 2}
              fill="none"
              stroke={hubAimed ? hoverColor : 'rgba(255,255,255,0.30)'}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <KeyRound
            size={Math.round(actualIconSize * 0.5)}
            strokeWidth={1.6}
            color={hubAimed ? hoverForeground : '#F4F2ED'}
          />
        </div>

        {/* O anel é estado, não escolha: fatias trancadas, inertes e sem rótulo. */}
        {Array.from({ length: LOCKED_SLICE_COUNT }).map((_, index) => {
          const angleRad = (index * (360 / LOCKED_SLICE_COUNT) - 90) * (Math.PI / 180);
          const x = actualMenuRadius * Math.cos(angleRad);
          const y = actualMenuRadius * Math.sin(angleRad);
          const shade = 12 + Math.round(config.backdropOpacity * 10);
          const isAimed = aimed === index;

          return (
            <div
              key={index}
              className="zn-radial-slice absolute top-0 left-0 pointer-events-none"
              style={{
                ['--zn-tf' as string]: bloom
                  ? `translate3d(${snapToDevicePixel(x)}px, ${snapToDevicePixel(y)}px, 0) scale(1)`
                  : 'translate3d(0px, 0px, 0) scale(0.2)',
                /**
                 * O alfa do contentor multiplica o fundo do próprio tile: baixá-lo transformava a
                 * fatia numa mancha sobre o desktop. "Trancado" diz-se pelo conteúdo — cadeado
                 * apagado e borda contida — nunca por transparência.
                 */
                ['--zn-op' as string]: bloom ? (isAimed ? 1 : 0.94) : 0,
                zIndex: 100,
              }}
              aria-hidden
            >
              <div className="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
                <div
                  className="rounded-[18px] flex items-center justify-center transition-[border-color,color] duration-150"
                  style={{
                    width: `${actualIconSize}px`,
                    height: `${actualIconSize}px`,
                    backgroundColor: `rgba(${shade}, ${shade}, ${shade}, 0.985)`,
                    border: `1px solid rgba(255,255,255,${(isAimed ? 0.34 : 0.24) + config.backdropOpacity * 0.08})`,
                    color: isAimed ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.5)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(0,0,0,0.5), 0 8px 22px rgba(0,0,0,0.42)',
                  }}
                >
                  <Lock size={Math.round(actualIconSize * 0.38)} strokeWidth={1.5} />
                </div>
              </div>
            </div>
          );
        })}

        {/* Pílula de contexto: onde estás e o que o gesto atual faz. */}
        <div
          className="zn-radial-pill absolute left-0 top-0 pointer-events-none z-30"
          style={{
            ['--zn-tf' as string]: `translate(-50%, 0) translate3d(0, ${pillOffset}px, 0)`,
            ['--zn-op' as string]: bloom ? 1 : 0,
          }}
        >
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full whitespace-nowrap transition-[border-color] duration-150"
            style={{
              background: 'rgba(4,5,7,0.92)',
              border: `1px solid ${hubAimed ? `${hoverColor}66` : 'rgba(255,255,255,0.14)'}`,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.45)',
            }}
          >
            <span
              className="text-[11px] leading-none text-white/60"
              style={{ fontFamily: 'var(--font-radial)', fontWeight: 500 }}
            >
              Rovyl
            </span>
            <span className="text-[11px] leading-none text-white/25">/</span>
            <span
              className="text-[11px] leading-none text-white/60"
              style={{ fontFamily: 'var(--font-radial)', fontWeight: 500 }}
            >
              Locked
            </span>
            {/* O chip nomeia o gesto disponível agora, como o `Center` / `Back` do radial. */}
            <span
              className="text-[10px] leading-none px-1.5 py-1 rounded-[5px] transition-[background-color,color] duration-150"
              style={{
                background: hubAimed ? hoverColor : 'rgba(255,255,255,0.09)',
                color: hubAimed ? hoverForeground : 'rgba(255,255,255,0.45)',
                fontFamily: 'var(--font-radial)',
                fontWeight: 500,
              }}
            >
              {hubAimed ? 'Activate license' : 'Center to activate'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
