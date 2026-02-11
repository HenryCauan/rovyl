Add-Type -AssemblyName System.Drawing
$path = "C:\Windows\System32\notepad.exe"
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
$bitmap = $icon.ToBitmap()
Write-Output "Icon Size: $($bitmap.Width)x$($bitmap.Height)"
$icon.Dispose()
$bitmap.Dispose()
