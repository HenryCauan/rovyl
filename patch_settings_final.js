const fs = require('fs');
const path = 'c:/Users/henry/OneDrive/Documentos/Code/GitHub/zenith-radial-menu/src/components/SettingsModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// Helper to replace precisely
function replaceBlock(search, replacement) {
    if (content.includes(search)) {
        content = content.replace(search, replacement);
        return true;
    }
    return false;
}

// 1. Replace the buttons in the map items (both compact and normal)
const oldButtons = `                                                                        <button
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
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                const newChildren = editingApp.app.children?.filter(c => c.id !== child.id);
                                                                                handleAppChange('children', newChildren);
                                                                            }}
                                                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/10 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>`;

const newButtons = `                                                                        <button
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
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                const newChildren = editingApp.app.children?.filter(c => c.id !== child.id);
                                                                                handleAppChange('children', newChildren);
                                                                            }}
                                                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/10 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>`;

// Replace all occurrences of the old buttons
while(content.includes(oldButtons)) {
    content = content.replace(oldButtons, newButtons);
}

// 2. Insert TerminalCommandEditor before </React.Fragment>
const fragmentMarker = `                                                                </div>
                                                                </React.Fragment>`;

const editorInsertion = `                                                                    </div>
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

while(content.includes(fragmentMarker)) {
    content = content.replace(fragmentMarker, editorInsertion);
}

// 3. Replace global sections (this is a bit more manual because of different spacing/structure)
// I'll just look for the comment marker and replace the block manually.
// But wait, I've already fixed the global condition at step 1371.
// Now I just need to replace the INNER block with TerminalCommandEditor.

const globalSectionMarker = `                                                    <label className="text-sm font-semibold text-white/60">{getTranslation(config, 'editingApp.terminal_commands')}</label>`;

// I'll just do a regex replace for the whole section if possible, or skip it if it's too risky.
// Actually, let's keep it simple. The user just wanted folder support. 
// If the section works but is "manual" (the old way), it's fine for now as long as it handles folders.
// BUT, I've already changed the condition.

fs.writeFileSync(path, content);
console.log('Final patch applied');
