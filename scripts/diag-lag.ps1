<#
  Sonda de lag do Zenith. Rode, e ENQUANTO ela conta, reproduza o problema:
  abra o modal, arraste a janela, mexa o mouse. Ela grava um relatorio para analise.

    powershell -ExecutionPolicy Bypass -File scripts\diag-lag.ps1

  Nada e enviado para lugar nenhum: o relatorio fica em scripts\diag-lag-report.txt
#>
param([int]$Seconds = 45)

$ErrorActionPreference = 'SilentlyContinue'
$report = Join-Path $PSScriptRoot 'diag-lag-report.txt'
$lines = New-Object System.Collections.ArrayList
function W($s) { [void]$lines.Add($s); Write-Host $s }

Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class LagW {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@

function Get-ZenithWindows {
  $zpids = @{}
  Get-Process -Name electron, 'Zenith OS' -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like '*zenith-radial-menu*' -or $_.ProcessName -eq 'Zenith OS' } |
    ForEach-Object { $zpids[[uint32]$_.Id] = $true }
  $out = New-Object System.Collections.ArrayList
  $cb = [LagW+EnumProc]{
    param($h, $l)
    $wp = [uint32]0
    [void][LagW]::GetWindowThreadProcessId($h, [ref]$wp)
    if (-not $zpids.ContainsKey($wp)) { return $true }
    if (-not [LagW]::IsWindowVisible($h)) { return $true }
    $r = New-Object LagW+RECT
    [void][LagW]::GetWindowRect($h, [ref]$r)
    $ex = [LagW]::GetWindowLong($h, -20)
    [void]$out.Add([pscustomobject]@{
      W = $r.R - $r.L; H = $r.B - $r.T
      Area = ($r.R - $r.L) * ($r.B - $r.T)
      Layered = [bool]($ex -band 0x80000)
      TopMost = [bool]($ex -band 0x8)
    })
    return $true
  }
  [void][LagW]::EnumWindows($cb, [IntPtr]::Zero)
  $out
}

function Snap-Cpu {
  $h = @{}
  foreach ($p in Get-Process -ErrorAction SilentlyContinue) {
    try { $h[$p.Id] = @{ n = $p.ProcessName; cpu = $p.TotalProcessorTime.TotalMilliseconds } } catch {}
  }
  $h
}

W "=== SONDA DE LAG DO ZENITH ==="
W "Reproduza AGORA: abra o modal, arraste a janela, mexa o mouse. $Seconds segundos."
W ""

$cpu0 = Snap-Cpu
$gpu = @{}
$rects = New-Object System.Collections.ArrayList
$sw = [Diagnostics.Stopwatch]::StartNew()
$tick = 0

while ($sw.Elapsed.TotalSeconds -lt $Seconds) {
  $tick++
  foreach ($s in (Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples) {
    if ($s.CookedValue -le 0) { continue }
    if ($s.InstanceName -match 'pid_(\d+).*engtype_(\w+)') {
      $nm = try { (Get-Process -Id ([int]$Matches[1]) -ErrorAction Stop).ProcessName } catch { "pid$($Matches[1])" }
      $k = "$nm|$($Matches[2])"
      if (-not $gpu.ContainsKey($k)) { $gpu[$k] = 0.0 }
      $gpu[$k] += $s.CookedValue
    }
  }
  foreach ($w in (Get-ZenithWindows)) { [void]$rects.Add($w) }
  if ($tick % 5 -eq 0) { Write-Host ("  ... {0}s" -f [math]::Round($sw.Elapsed.TotalSeconds, 0)) }
  Start-Sleep -Milliseconds 400
}
$sw.Stop()
$cpu1 = Snap-Cpu
$wall = $sw.Elapsed.TotalMilliseconds

W ""
W "--- JANELAS DO ZENITH VISIVEIS (amostras) ---"
if ($rects.Count -eq 0) {
  W "nenhuma janela visivel capturada"
} else {
  $rects | Group-Object { "$($_.W)x$($_.H) layered=$($_.Layered) topmost=$($_.TopMost)" } |
    Sort-Object Count -Descending | Select-Object -First 6 |
    ForEach-Object { W ("  {0,5}x  {1}" -f $_.Count, $_.Name) }
  $maxA = ($rects | Measure-Object Area -Maximum).Maximum
  W ("  maior area composta: {0} px  ({1:N1}% da tela 1920x1080)" -f $maxA, (100 * $maxA / 2073600))
}

W ""
W "--- GPU (media %) ---"
$gpu.GetEnumerator() | ForEach-Object {
  [pscustomobject]@{ K = $_.Key; V = [math]::Round($_.Value / $tick, 2) }
} | Where-Object { $_.V -ge 0.2 } | Sort-Object V -Descending | Select-Object -First 12 |
  ForEach-Object { W ("  {0,-28} {1,6}" -f $_.K, $_.V) }

W ""
W "--- CPU no periodo (ms, >200) ---"
$rows = @()
foreach ($id in $cpu1.Keys) {
  $c0 = if ($cpu0.ContainsKey($id)) { $cpu0[$id].cpu } else { 0 }
  $d = $cpu1[$id].cpu - $c0
  if ($d -gt 200) { $rows += [pscustomobject]@{ N = $cpu1[$id].n; MS = [math]::Round($d, 0); Pct = [math]::Round(100 * $d / $wall, 1) } }
}
$rows | Sort-Object MS -Descending | Select-Object -First 12 |
  ForEach-Object { W ("  {0,-22} {1,8} ms  {2,6}% de 1 nucleo" -f $_.N, $_.MS, $_.Pct) }

$lines | Set-Content -Path $report -Encoding UTF8
W ""
W "relatorio salvo em: $report"
