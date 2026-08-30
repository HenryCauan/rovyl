# Rovyl — helper persistente que rouba o primeiro plano para um HWND.
#
# O radial é revelado com ShowWindow(SW_SHOWNOACTIVATE) + always-on-top, portanto o Windows aplica
# o foreground lock: SetForegroundWindow chamado pelo próprio processo (ou por app.focus do Electron)
# é ignorado e a janela fica visível mas sem teclado — as teclas continuam a ir para a app de baixo.
# A saída documentada do lock é partilhar a fila de input com a thread que ESTÁ em primeiro plano
# (AttachThreadInput) e só então pedir o foreground.
#
# Fica vivo a ler stdin ("FOCUS <hwnd>" / "EXIT") porque arrancar um powershell custa centenas de
# milissegundos — tempo suficiente para o utilizador começar a escrever para a janela errada.
$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class RovylForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
}
"@

function Invoke-ForegroundSteal([string]$rawHandle) {
  $value = 0L
  if (-not [int64]::TryParse($rawHandle, [ref]$value) -or $value -eq 0) { return 'BADHWND' }
  $target = [IntPtr]$value
  if (-not [RovylForeground]::IsWindowVisible($target)) { return 'HIDDEN' }
  if ([RovylForeground]::GetForegroundWindow() -eq $target) { return 'ALREADY' }

  $foreground = [RovylForeground]::GetForegroundWindow()
  $foregroundThread = [RovylForeground]::GetWindowThreadProcessId($foreground, [IntPtr]::Zero)
  $targetThread = [RovylForeground]::GetWindowThreadProcessId($target, [IntPtr]::Zero)
  $selfThread = [RovylForeground]::GetCurrentThreadId()

  $attachedForeground = $false
  $attachedTarget = $false
  try {
    if ($foregroundThread -ne 0 -and $foregroundThread -ne $selfThread) {
      $attachedForeground = [RovylForeground]::AttachThreadInput($selfThread, $foregroundThread, $true)
    }
    if ($targetThread -ne 0 -and $targetThread -ne $selfThread) {
      $attachedTarget = [RovylForeground]::AttachThreadInput($selfThread, $targetThread, $true)
    }

    # SW_SHOW (5): nunca SW_RESTORE — a janela é transparente e um restore anima/pisca o HWND.
    [void][RovylForeground]::ShowWindow($target, 5)
    [void][RovylForeground]::BringWindowToTop($target)
    [void][RovylForeground]::SetForegroundWindow($target)
    [void][RovylForeground]::SetFocus($target)
  } finally {
    if ($attachedTarget) { [void][RovylForeground]::AttachThreadInput($selfThread, $targetThread, $false) }
    if ($attachedForeground) { [void][RovylForeground]::AttachThreadInput($selfThread, $foregroundThread, $false) }
  }

  if ([RovylForeground]::GetForegroundWindow() -eq $target) { return 'OK' }
  return 'MISS'
}

Write-Output 'READY'

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $line = $line.Trim()
  if ($line -eq '' ) { continue }
  if ($line -eq 'EXIT') { break }
  $parts = $line.Split(' ')
  if ($parts[0] -ne 'FOCUS' -or $parts.Length -lt 2) { continue }
  try {
    Write-Output (Invoke-ForegroundSteal $parts[1])
  } catch {
    Write-Output "ERR $($_.Exception.Message)"
  }
}
