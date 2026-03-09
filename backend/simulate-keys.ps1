# simulate-keys.ps1
param(
    [int[]]$vks # Array of virtual key codes
)

$definition = @'
using System;
using System.Runtime.InteropServices;

public class Win32 {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);
}
'@

if (-not ([System.Management.Automation.PSTypeName]'Win32').Type) {
    Add-Type -TypeDefinition $definition
}

# Press modifiers and keys
foreach ($vk in $vks) {
    [Win32]::keybd_event([byte]$vk, 0, 0, 0)
}

# Short delay to ensure system registers the combination
Start-Sleep -Milliseconds 50

# Release in reverse order
$reversedVks = $vks[($vks.Length - 1)..0]
foreach ($vk in $reversedVks) {
    [Win32]::keybd_event([byte]$vk, 0, 2, 0)
}
