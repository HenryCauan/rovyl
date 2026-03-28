const fs = require('fs');
const path = 'c:/Users/henry/OneDrive/Documentos/Code/GitHub/zenith-radial-menu/src/components/SettingsModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add TerminalCommandEditor Component
if (!content.includes('const TerminalCommandEditor')) {
    const component = `
const TerminalCommandEditor = ({ commands, config, onChange, onAdd, onRemove, compact = false }) => {
    return (
        <div className="space-y-3">
            {!compact && (
                <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        {getTranslation(config, 'editingApp.terminal_commands')}
                    </label>
                    <button
                        onClick={onAdd}
                        className="flex items-center gap-1 text-[10px] font-bold text-purple-400/80 hover:text-purple-400 transition-colors uppercase tracking-widest"
                    >
                        <Plus size={10} />
                        {getTranslation(config, 'editingApp.add_command')}
                    </button>
                </div>
            )}
            
            {commands.length === 0 ? (
                <div className={compact ? "p-4 rounded-xl border border-dashed border-white/5 bg-white/[0.01] flex flex-col items-center justify-center gap-2" : "p-6 rounded-2xl border border-dashed border-white/5 bg-white/[0.01] flex flex-col items-center justify-center gap-2"}>
                    <p className="text-[9px] text-white/10 uppercase font-bold tracking-widest">
                        {getTranslation(config, 'status.no_app_selected') || 'Nenhum comando'}
                    </p>
                    {compact && (
                        <button
                            onClick={onAdd}
                            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[9px] font-bold text-white/40 hover:text-white hover:bg-white/10 transition-all uppercase tracking-widest flex items-center gap-1.5"
                        >
                            <Plus size={12} />
                            {getTranslation(config, 'editingApp.add_command')}
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {commands.map((cmd, idx) => (
                        <div key={idx} className="flex gap-2 group/cmd animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="flex-1 relative">
                                <input
                                    type="text"
                                    value={cmd}
                                    onChange={(e) => onChange(idx, e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono text-purple-400/80 focus:border-purple-400/40 focus:bg-black/60 outline-none transition-all duration-300"
                                    placeholder={getTranslation(config, 'editingApp.command_placeholder') || 'Ex: npm start'}
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-purple-400/20" />
                            </div>
                            <button
                                onClick={() => onRemove(idx)}
                                className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.02] border border-white/5 text-white/10 hover:text-red-400 hover:bg-red-400/10 transition-all active:scale-90"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                    {compact && commands.length > 0 && (
                        <button
                            onClick={onAdd}
                            className="w-full py-2.5 rounded-xl border border-dashed border-white/5 bg-white/[0.01] text-[9px] font-bold text-white/20 hover:text-purple-400 hover:border-purple-400/20 hover:bg-purple-400/5 transition-all uppercase tracking-widest flex items-center justify-center gap-2 mt-2"
                        >
                            <Plus size={12} />
                            {getTranslation(config, 'editingApp.add_command')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
`;
    // Insert after "const AppEditorModal = ..."
    content = content.replace(/(const AppEditorModal = React\.memo\(\{[\s\S]*?\}\) => \{)/, `$1\n${component}`);
}

// 2. Add expandedFolderId state
if (!content.includes('const [expandedFolderId')) {
    content = content.replace(
        /(const \[showAppSelector, setShowAppSelector\] = useState\(false\);)/,
        `$1\n    const [expandedFolderId, setExpandedFolderId] = useState(null);`
    );
}

// 3. Update addFolder logic
content = content.replace(
    /description: 'Quick Access Folder'/g,
    "description: 'Quick Access Folder',\n                                                                terminalCommands: []"
);

// 4. Fix global condition
content = content.replace(
    /editingApp\.app\.type === 'app' && \(isIDE \|\| editingApp\.app\.commandType === 'folder'\) && \(/g,
    "(editingApp.app.type === 'app' || editingApp.app.type === 'folder') && (isIDE || editingApp.app.commandType === 'folder' || editingApp.app.type === 'folder') && ("
);

// 5. Replace Global Section with TerminalCommandEditor component
// This is to make it look premium
const oldGlobalSection = `<section className="space-y-3">
                                            <div className="flex items-center justify-between ml-1">
                                                <div className="space-y-0.5">
                                                    <label className="text-sm font-semibold text-white/60">{getTranslation(config, 'editingApp.terminal_commands')}</label>
                                                    <p className="text-[10px] text-white/20 uppercase tracking-wider font-bold">{getTranslation(config, 'editingApp.terminal_commands_desc')}</p>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newCommands = [...(editingApp.app.terminalCommands || []), ''];
                                                        handleAppChange('terminalCommands', newCommands);
                                                    }}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-white/50 hover:text-white hover:bg-white/10 transition-all uppercase tracking-wider"
                                                >
                                                    <Plus size={14} />
                                                    {getTranslation(config, 'editingApp.add_command')}
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {(!editingApp.app.terminalCommands || editingApp.app.terminalCommands.length === 0) ? (
                                                    <div className="p-6 rounded-2xl border border-dashed border-white/5 bg-white/[0.01] flex flex-col items-center justify-center gap-2 text-white/10">
                                                        <Command size={24} strokeWidth={1} />
                                                        <span className="text-[9px] uppercase font-bold tracking-widest">{getTranslation(config, 'status.no_app_selected') || 'Nenhum comando'}</span>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {editingApp.app.terminalCommands.map((cmd, idx) => (
                                                            <div key={idx} className="flex gap-2 group/cmd">
                                                                <div className="flex-1 relative group/input">
                                                                    <input
                                                                        type="text"
                                                                        value={cmd}
                                                                        onChange={(e) => {
                                                                            const newCommands = [...(editingApp.app.terminalCommands || [])];
                                                                            newCommands[idx] = e.target.value;
                                                                            handleAppChange('terminalCommands', newCommands);
                                                                        }}
                                                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-3 text-xs font-mono text-white/50 focus:border-white/30 focus:bg-black/60 outline-none transition-all duration-500 shadow-inner group-hover/input:border-white/20"
                                                                        placeholder={getTranslation(config, 'editingApp.command_placeholder') || 'Ex: npm start'}
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        const newCommands = editingApp.app.terminalCommands.filter((_, i) => i !== idx);
                                                                        handleAppChange('terminalCommands', newCommands);
                                                                    }}
                                                                    className="w-[46px] h-[46px] flex items-center justify-center rounded-xl bg-white/[0.02] border border-white/5 text-white/10 hover:text-red-400 hover:bg-red-400/10 transition-all active:scale-90"
                                                                >
                                                                    <X size={16} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </section>`;

const newGlobalSection = `<section className="space-y-3">
                                            <div className="flex items-center justify-between ml-1 text-white/60">
                                                <div className="space-y-0.5">
                                                    <label className="text-sm font-semibold">{getTranslation(config, 'editingApp.terminal_commands')}</label>
                                                    <p className="text-[10px] text-white/20 uppercase tracking-wider font-bold">{getTranslation(config, 'editingApp.terminal_commands_desc')}</p>
                                                </div>
                                            </div>
                                            <TerminalCommandEditor 
                                                commands={editingApp.app.terminalCommands || []}
                                                config={config}
                                                onChange={(idx, val) => {
                                                    const newCommands = [...(editingApp.app.terminalCommands || [])];
                                                    newCommands[idx] = val;
                                                    handleAppChange('terminalCommands', newCommands);
                                                }}
                                                onAdd={() => {
                                                    const newCommands = [...(editingApp.app.terminalCommands || []), ''];
                                                    handleAppChange('terminalCommands', newCommands);
                                                }}
                                                onRemove={(idx) => {
                                                    const newCommands = editingApp.app.terminalCommands.filter((_, i) => i !== idx);
                                                    handleAppChange('terminalCommands', newCommands);
                                                }}
                                            />
                                        </section>`;

// Use regex to replace the global section (matching with whitespace flexibility)
content = content.replace(/<section className="space-y-3">[\s\S]*?<label className="text-sm font-semibold text-white\/60">\{getTranslation\(config, 'editingApp\.terminal_commands'\)\}<\/label>[\s\S]*?<\/section>/g, newGlobalSection);

// 6. Quick Access UI (Fragments + Toggle + Editor)
// We look for the map item div and wrap it.
const mapItemStart = `<div key={child.id} className="group flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all">`;
const mapItemButtons = `<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">`;

// Wrap map items in Fragment
content = content.replace(
    /\.map\(\(child\) => \([\s\S]*?      <div key=\{child\.id\} className="group flex items-center gap-3 p-3 bg-white\/\[0\.02\] border border-white\/5 rounded-xl hover:bg-white\/\[0\.04\] transition-all">/g,
    (match) => match.replace('<div key={child.id}', '<React.Fragment key={child.id}>\n                                                                <div key={child.id}')
);

// Add closing tag Fragment
content = content.replace(
    /                                                                    <\/div>\n                                                                <\/div>\n                                                            \)\)\}/g,
    `                                                                    </div>\n                                                                </div>\n                                                                </React.Fragment>\n                                                            ))}`
);

// Add the buttons (Per Folder Editor Toggle)
const oldButtons = `<button
                                                                            onClick={() => {
                                                                                const newChildren = editingApp.app.children?.map(c => 
                                                                                    c.id === child.id ? { ...c, openTerminal: !c.openTerminal } : c
                                                                                );
                                                                                handleAppChange('children', newChildren);
                                                                            }}
                                                                            title={getTranslation(config, 'editingApp.toggle_terminal') || 'Abrir com Terminal'}`;

const newMapButtons = `<button
                                                                                onClick={() => setExpandedFolderId(expandedFolderId === child.id ? null : child.id)}
                                                                                title={getTranslation(config, 'editingApp.terminal_commands')}
                                                                                className={\`w-8 h-8 rounded-lg flex items-center justify-center transition-all \${
                                                                                    expandedFolderId === child.id 
                                                                                    ? 'text-purple-400 bg-purple-400/10' 
                                                                                    : (child.terminalCommands?.length ? 'text-purple-400/50 bg-purple-400/5' : 'text-white/10 hover:text-white/40 hover:bg-white/5')
                                                                                }\`}
                                                                            >
                                                                                <Settings2 size={14} />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    const newChildren = editingApp.app.children?.map(c => 
                                                                                        c.id === child.id ? { ...c, openTerminal: !c.openTerminal } : c
                                                                                    );
                                                                                    handleAppChange('children', newChildren);
                                                                                }}
                                                                                title={getTranslation(config, 'editingApp.toggle_terminal') || 'Abrir com Terminal'}`;

content = content.replace(new RegExp(oldButtons, 'g'), newMapButtons);

// Add the expanded editor insertion
const fragmentClosing = `                                                                </div>\n                                                                </React.Fragment>`;
const expandedEditor = `                                                                    </div>
                                                                    {expandedFolderId === child.id && (
                                                                        <div className="mt-2 ml-11 p-4 bg-black/40 border border-white/5 rounded-2xl animate-in slide-in-from-top-2 duration-300">
                                                                            <TerminalCommandEditor 
                                                                                commands={child.terminalCommands || []}
                                                                                config={config}
                                                                                compact={true}
                                                                                onChange={(tidx, val) => {
                                                                                    const newChildren = editingApp.app.children?.map(c => {
                                                                                        if (c.id === child.id) {
                                                                                            const ncmds = [...(c.terminalCommands || [])];
                                                                                            ncmds[tidx] = val;
                                                                                            return { ...c, terminalCommands: ncmds };
                                                                                        }
                                                                                        return c;
                                                                                    });
                                                                                    handleAppChange('children', newChildren);
                                                                                }}
                                                                                onAdd={() => {
                                                                                    const newChildren = editingApp.app.children?.map(c => {
                                                                                        if (c.id === child.id) {
                                                                                            return { ...c, terminalCommands: [...(c.terminalCommands || []), ''] };
                                                                                        }
                                                                                        return c;
                                                                                    });
                                                                                    handleAppChange('children', newChildren);
                                                                                }}
                                                                                onRemove={(tidx) => {
                                                                                    const newChildren = editingApp.app.children?.map(c => {
                                                                                        if (c.id === child.id) {
                                                                                            return { ...c, terminalCommands: (c.terminalCommands || []).filter((_, i) => i !== tidx) };
                                                                                        }
                                                                                        return c;
                                                                                    });
                                                                                    handleAppChange('children', newChildren);
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </React.Fragment>`;

content = content.replace(new RegExp(fragmentClosing, 'g'), expandedEditor);

fs.writeFileSync(path, content);
console.log('Zenith Terminal Commands Fully Implemented');
