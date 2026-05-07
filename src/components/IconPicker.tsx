import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { ICON_MAP, getIcon } from '../iconMap';
import type { UIConfig } from '../types';
import { getTranslation } from '../translations';
import {
  buildResolvedEnglishKeywordMap,
  collectIconsForEnglishTokens,
} from '../utils/iconPickerEnglishKeywords';

// Get all icon names from the map, filtering out any internal lucide stuff
const ALL_ICONS = Object.keys(ICON_MAP)
  .filter(name => /^[A-Z]/.test(name) && (typeof ICON_MAP[name] === 'function' || (typeof ICON_MAP[name] === 'object' && ICON_MAP[name] !== null)))
  .sort();

const VALID_ICON_NAME_SET = new Set(ALL_ICONS);
const RESOLVED_ENGLISH_KEYWORD_MAP = buildResolvedEnglishKeywordMap(VALID_ICON_NAME_SET);

export interface IconPickerProps {
  selectedIcon: string;
  onSelect: (iconName: string) => void;
  config: UIConfig;
  /** `compact`: grid mais densa, busca menor — para painéis estreitos (ex.: ícone do workspace). */
  variant?: 'default' | 'compact';
  className?: string;
}

export const IconPicker: React.FC<IconPickerProps> = ({
  selectedIcon,
  onSelect,
  config,
  variant = 'default',
  className = '',
}) => {
  const compact = variant === 'compact';
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(compact ? 80 : 64);

  const searchTokens = React.useMemo(
    () => searchTerm.toLowerCase().trim().split(/\s+/).filter(Boolean),
    [searchTerm]
  );

  const filteredIcons = React.useMemo(() => {
    if (searchTokens.length === 0) return ALL_ICONS;

    const byName = ALL_ICONS.filter(icon => {
      const n = icon.toLowerCase();
      return searchTokens.some(t => n.includes(t));
    });

    const byKeyword = collectIconsForEnglishTokens(searchTokens, RESOLVED_ENGLISH_KEYWORD_MAP);
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const i of byName) {
      if (!seen.has(i)) {
        seen.add(i);
        ordered.push(i);
      }
    }
    for (const i of byKeyword) {
      if (!seen.has(i)) {
        seen.add(i);
        ordered.push(i);
      }
    }
    return ordered;
  }, [searchTokens]);

  const visibleIcons = React.useMemo(() =>
    filteredIcons.slice(0, visibleCount),
    [filteredIcons, visibleCount]);

  React.useEffect(() => {
    setVisibleCount(compact ? 80 : 64);
  }, [searchTerm, compact]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      const step = compact ? 80 : 64;
      setVisibleCount(prev => Math.min(prev + step, filteredIcons.length));
    }
  };

  const iconBtnSize = compact ? 18 : 24;
  const gridClass = compact
    ? 'grid grid-cols-8 sm:grid-cols-9 gap-1.5'
    : 'grid grid-cols-6 gap-2';

  return (
    <div className={`flex flex-col ${compact ? 'gap-2' : 'gap-3 h-full'} ${className}`}>
      <div className="relative group shrink-0">
        <Search
          className={`absolute top-1/2 -translate-y-1/2 text-white/25 group-focus-within:text-white/45 transition-colors ${compact ? 'left-2.5' : 'left-3.5'}`}
          size={compact ? 14 : 15}
        />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={getTranslation(config, 'iconPicker.search_placeholder')}
          className={
            compact
              ? 'w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white/90 placeholder:text-white/25 focus:outline-none focus:border-white/18 focus:bg-white/[0.06] transition-all'
              : 'w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 focus:bg-white/[0.06] transition-all duration-300'
          }
        />
      </div>

      <p
        className={`shrink-0 text-white/25 ${compact ? 'text-[9px] leading-snug' : 'text-[10px] leading-relaxed'}`}
      >
        {getTranslation(config, 'iconPicker.english_keywords_hint')}
      </p>

      <div
        className={`${gridClass} overflow-y-auto overflow-x-hidden pr-0.5 custom-scrollbar content-start ${compact ? 'min-h-0 max-h-[168px] pb-1' : 'flex-1 pb-2'}`}
        onScroll={handleScroll}
      >
        {visibleIcons.map(iconName => {
          const Icon = getIcon(iconName);
          const isSelected = iconName === selectedIcon;

          return (
            <button
              key={iconName}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onSelect(iconName);
              }}
              className={
                compact
                  ? `aspect-square rounded-md flex items-center justify-center transition-all duration-150 relative
                ${isSelected
                    ? 'bg-white text-black ring-1 ring-inset ring-white/95 shadow-[0_0_0_1px_rgba(255,255,255,0.4)] z-10'
                    : 'bg-white/[0.04] text-white/40 border border-white/[0.06] hover:border-white/20 hover:bg-white/[0.08] hover:text-white/85 active:scale-[0.97]'
                  }`
                  : `aspect-square rounded-lg flex items-center justify-center
                transition-all duration-200 relative
                ${isSelected
                    ? 'bg-white text-black shadow-[0_0_16px_rgba(255,255,255,0.15)] scale-105'
                    : 'bg-white/[0.03] text-white/30 border border-white/[0.04] hover:border-white/15 hover:text-white/80 hover:bg-white/[0.07] hover:scale-105'
                  }`
              }
              title={iconName}
            >
              <Icon size={iconBtnSize} strokeWidth={compact ? 1.5 : 1.5} />
            </button>
          );
        })}

        {filteredIcons.length === 0 && (
          <div className={compact ? 'col-span-8 sm:col-span-9 py-6 text-center' : 'col-span-6 py-10 text-center'}>
            <p className="text-white/20 text-xs font-medium">
              {getTranslation(config, 'iconPicker.no_results')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
