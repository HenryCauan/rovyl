# Poll only the middle-button state instead of installing WH_MOUSE_LL.
# A managed low-level hook is called synchronously for every mouse movement in Windows; if the
# PowerShell/.NET host stalls even briefly, the system cursor becomes delayed and erratic.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class ZenithMouseButtonState {
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int virtualKey);
}
"@

$VK_MBUTTON = 0x04
$wasDown = $false

try {
    while ($true) {
        $state = [int][ZenithMouseButtonState]::GetAsyncKeyState($VK_MBUTTON)
        $isDown = ($state -band 0x8000) -ne 0

        if ($isDown -ne $wasDown) {
            if ($isDown) {
                [Console]::WriteLine("MIDDLE_DOWN")
            } else {
                [Console]::WriteLine("MIDDLE_UP")
            }
            [Console]::Out.Flush()
            $wasDown = $isDown
        }

        # A normal click lasts well over one frame; 16 ms halves wake-ups without losing MMB.
        Start-Sleep -Milliseconds 16
    }
} catch {
    [Console]::WriteLine("ERROR: " + $_.Exception.Message)
    [Console]::Out.Flush()
}
