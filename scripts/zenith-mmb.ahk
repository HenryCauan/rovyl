; Zenith Radial Menu - MMB Shortcut
; Este script mapeia o botão do meio do mouse (MMB) para o atalho do Zenith (Alt+Z)

#NoEnv  ; Recommended for performance and compatibility with future AutoHotkey releases.
; #Warn  ; Enable warnings to assist with detecting common errors.
SendMode Input  ; Recommended for new scripts due to its superior speed and reliability.
SetWorkingDir %A_ScriptDir%  ; Ensures a consistent starting directory.

; Pressionar MMB para executar ação
MButton::
    ; Envia Alt+Z que é o atalho global definido no electron-main.js
    Send, !z
Return

; Atalho de teste: Ctrl + MMB
^MButton::
    MsgBox, Zenith Radial Menu AHK Script is Active!
Return
