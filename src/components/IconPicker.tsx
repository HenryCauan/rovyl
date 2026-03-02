import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { ICON_MAP, getIcon } from '../iconMap';

// Get all icon names from the map, filtering out any internal lucide stuff
const ALL_ICONS = Object.keys(ICON_MAP)
  .filter(name => /^[A-Z]/.test(name) && (typeof ICON_MAP[name] === 'function' || (typeof ICON_MAP[name] === 'object' && ICON_MAP[name] !== null)))
  .sort();

interface IconPickerProps {
  selectedIcon: string;
  onSelect: (iconName: string) => void;
}

export const IconPicker: React.FC<IconPickerProps> = ({ selectedIcon, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(64);

  const filteredIcons = React.useMemo(() => {
    const term = searchTerm.toLowerCase();
    return ALL_ICONS.filter(icon =>
      icon.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const visibleIcons = React.useMemo(() =>
    filteredIcons.slice(0, visibleCount),
    [filteredIcons, visibleCount]);

  // Reset pagination when search changes
  React.useEffect(() => {
    setVisibleCount(64);
  }, [searchTerm]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      setVisibleCount(prev => Math.min(prev + 64, filteredIcons.length));
    }
  };

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Search Input */}
      <div className="relative group shrink-0">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white/50 transition-colors duration-300" size={15} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Procure por um ícone..."
          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 focus:bg-white/[0.06] transition-all duration-300"
        />
      </div>

      {/* Grid container */}
      <div
        className="flex-1 grid grid-cols-6 gap-2 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar content-start pb-2"
        onScroll={handleScroll}
      >
        {visibleIcons.map(iconName => {
          const Icon = getIcon(iconName);
          const isSelected = iconName === selectedIcon;

          return (
            <button
              key={iconName}
              onClick={(e) => {
                e.preventDefault();
                onSelect(iconName);
              }}
              className={`
                aspect-square rounded-lg flex items-center justify-center
                transition-all duration-200 relative
                ${isSelected
                  ? 'bg-white text-black shadow-[0_0_16px_rgba(255,255,255,0.15)] scale-105'
                  : 'bg-white/[0.03] text-white/30 border border-white/[0.04] hover:border-white/15 hover:text-white/80 hover:bg-white/[0.07] hover:scale-105'
                }
              `}
              title={iconName}
            >
              <Icon size={24} strokeWidth={1.5} />
            </button>
          );
        })}

        {filteredIcons.length === 0 && (
          <div className="col-span-6 py-10 text-center">
            <p className="text-white/15 text-sm font-medium">Nenhum ícone encontrado.</p>
          </div>
        )}
      </div>

    </div>
  );
};
