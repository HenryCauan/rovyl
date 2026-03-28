const fs = require('fs');
const path = 'c:/Users/henry/OneDrive/Documentos/Code/GitHub/zenith-radial-menu/src/components/SettingsModal.tsx';
let content = fs.readFileSync(path, 'utf8');

function patchLayout(searchStr, isCompact) {
    let index = content.indexOf(searchStr);
    if (index === -1) {
        console.error('Could not find search string for ' + (isCompact ? 'compact' : 'normal') + ' layout');
        return;
    }

    // 1. Wrap in Fragment
    const fragmentStart = '<React.Fragment key={child.id}>\n                                                                ';
    content = content.slice(0, index) + fragmentStart + content.slice(index);
    
    // Refresh index after insert
    index = content.indexOf(searchStr, index + fragmentStart.length);

    // 2. Add Settings2 Button
    const buttonSearch = "title={getTranslation(config, 'editingApp.toggle_terminal')";
    let btnIndex = content.indexOf(buttonSearch, index);
    if (btnIndex !== -1) {
        // Back up to the start of the button tag
        let tagStart = content.lastIndexOf('<button', btnIndex);
        const newButton = `
                                                                            <button
                                                                                onClick={() => setExpandedFolderId(expandedFolderId === child.id ? null : child.id)}
                                                                                title={getTranslation(config, 'editingApp.terminal_commands')}
                                                                                className={\`w-8 h-8 rounded-lg flex items-center justify-center transition-all \${
                                                                                    expandedFolderId === child.id 
                                                                                    ? 'text-purple-400 bg-purple-400/10' 
                                                                                    : (child.terminalCommands?.length ? 'text-purple-400/50 bg-purple-400/5' : 'text-white/10 hover:text-white/40 hover:bg-white/5')
                                                                                }\`}
                                                                            >
                                                                                <Settings2 size={14} />
                                                                            </button>`;
        content = content.slice(0, tagStart) + newButton + content.slice(tagStart);
    }

    // 3. Add Editor and Close Fragment
    // We look for the closing of the outer div of the map item
    // Search for the end of the div that starts with searchStr
    let divEnd = content.indexOf('</div>', index);
    // There are nested divs, so we need to find the matching one.
    // The div we want ends after the buttons container.
    let buttonsEnd = content.indexOf('</div>', divEnd + 6); // End of buttons container
    let itemEnd = content.indexOf('</div>', buttonsEnd + 6); // End of item container

    const editorCode = `
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
    
    content = content.slice(0, itemEnd + 6) + editorCode + content.slice(itemEnd + 6);
}

// Compact Layout
patchLayout('<div key={child.id} className="group flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all">', true);

// Normal Layout (it's the same string, but we want the second occurrence)
// We need to advance the content search for the second one.
let firstOccur = content.indexOf('<div key={child.id} className="group flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all">');
let secondOccur = content.indexOf('<div key={child.id} className="group flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all">', firstOccur + 1);

if (secondOccur !== -1) {
    // We manually patch the second one to avoid recursion issues with the helper
    const fragmentStart = '<React.Fragment key={child.id}>\n                                                                ';
    content = content.slice(0, secondOccur) + fragmentStart + content.slice(secondOccur);
    
    const buttonSearch = "title={getTranslation(config, 'editingApp.toggle_terminal')";
    let btnIndex = content.indexOf(buttonSearch, secondOccur + fragmentStart.length);
    if (btnIndex !== -1) {
        let tagStart = content.lastIndexOf('<button', btnIndex);
        const newButton = `
                                                                            <button
                                                                                onClick={() => setExpandedFolderId(expandedFolderId === child.id ? null : child.id)}
                                                                                title={getTranslation(config, 'editingApp.terminal_commands')}
                                                                                className={\`w-8 h-8 rounded-lg flex items-center justify-center transition-all \${
                                                                                    expandedFolderId === child.id 
                                                                                    ? 'text-purple-400 bg-purple-400/10' 
                                                                                    : (child.terminalCommands?.length ? 'text-purple-400/50 bg-purple-400/5' : 'text-white/10 hover:text-white/40 hover:bg-white/5')
                                                                                }\`}
                                                                            >
                                                                                <Settings2 size={14} />
                                                                            </button>`;
        content = content.slice(0, tagStart) + newButton + content.slice(tagStart);
    }

    let divEnd = content.indexOf('</div>', secondOccur + fragmentStart.length);
    let buttonsEnd = content.indexOf('</div>', divEnd + 6);
    let itemEnd = content.indexOf('</div>', buttonsEnd + 6);

    const editorCode = `
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
    content = content.slice(0, itemEnd + 6) + editorCode + content.slice(itemEnd + 6);
}

// Final touch: Fix the visibility condition for the global terminal commands section
content = content.replace(
    'editingApp.app.type === \'app\' && (isIDE || editingApp.app.commandType === \'folder\')',
    '(editingApp.app.type === \'app\' || editingApp.app.type === \'folder\') && (isIDE || editingApp.app.commandType === \'folder\' || editingApp.app.type === \'folder\')'
);

fs.writeFileSync(path, content);
console.log('Surgical Patch Applied Successfully');
