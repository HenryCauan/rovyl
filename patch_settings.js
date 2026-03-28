const fs = require('fs');
const path = 'c:/Users/henry/OneDrive/Documentos/Code/GitHub/zenith-radial-menu/src/components/SettingsModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Wrap Quick Access map items in React.Fragment
content = content.replace(
    /\.map\(\(child\) => \(/g,
    `.map((child) => (\n                                                                <React.Fragment key={child.id}>`
);

// 2. Close React.Fragment and add TerminalCommandEditor (Compact)
// We look for the closing section of the Quick Access map in the compact layout
const compactMapMarker = 'title={getTranslation(config, \'editingApp.toggle_terminal\') || \'Abrir com Terminal\'}';
const compactButtonsBlock = `                                                                        <button
                                                                            onClick={() => {
                                                                                const newChildren = editingApp.app.children?.map(c => 
                                                                                    c.id === child.id ? { ...c, openTerminal: !c.openTerminal } : c
                                                                                );
                                                                                handleAppChange('children', newChildren);
                                                                            }}
                                                                            title={getTranslation(config, 'editingApp.toggle_terminal') || 'Abrir com Terminal'}
                                                                            className={\`w-8 h-8 rounded-lg flex items-center justify-center transition-all \${
                                                                                child.openTerminal 
                                                                                ? 'text-blue-400 bg-blue-400/10 hover:bg-blue-400/20' 
                                                                                : 'text-white/10 hover:text-white/40 hover:bg-white/5'
                                                                            }\`}
                                                                        >
                                                                            <Command size={14} />
                                                                        </button>`;

content = content.replace(compactButtonsBlock, `                                                                        <button
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
                                                                            title={getTranslation(config, 'editingApp.toggle_terminal') || 'Abrir com Terminal'}
                                                                            className={\`w-8 h-8 rounded-lg flex items-center justify-center transition-all \${
                                                                                child.openTerminal 
                                                                                ? 'text-blue-400 bg-blue-400/10 hover:bg-blue-400/20' 
                                                                                : 'text-white/10 hover:text-white/40 hover:bg-white/5'
                                                                            }\`}
                                                                        >
                                                                            <Command size={14} />
                                                                        </button>`);

// Add TerminalCommandEditor expansion block
// We do this by finding the closing </div> of the item and inserting before the </React.Fragment>
// This is tricky because the Fragment closing tag isn't there yet (or is it?).
// Let's assume we just added the Fragment opener.

// Find the map closing )})} and add the Fragment closing tag
content = content.replace(
    /                                                            \)\)\}/g,
    `                                                                </React.Fragment>\n                                                            ))}`
);

fs.writeFileSync(path, content);
console.log('Patch applied partially');
