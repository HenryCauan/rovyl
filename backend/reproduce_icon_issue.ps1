$appName = "Cursor"
$apps = Get-StartApps | Where-Object { $_.Name -like "*$appName*" } | Select-Object -First 1

if ($apps) {
    Write-Host "Found App: $($apps.Name) - AppID: $($apps.AppID)"
    
    $startMenuPaths = @(
        "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
        "$env:ProgramData\Microsoft\Windows\Start Menu\Programs"
    )

    foreach ($path in $startMenuPaths) {
        if (Test-Path $path) {
            $lnk = Get-ChildItem -Path $path -Filter "$appName.lnk" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($lnk) {
                Write-Host "Found Shortcut: $($lnk.FullName)"
                $shell = New-Object -ComObject WScript.Shell
                $shortcut = $shell.CreateShortcut($lnk.FullName)
                
                Write-Host "IconLocation Raw: '$($shortcut.IconLocation)'"
                Write-Host "TargetPath: '$($shortcut.TargetPath)'"
                
                $iconPath = $null
                
                # Check IconLocation
                if ($shortcut.IconLocation) {
                    $possiblePath = $shortcut.IconLocation.Split(',')[0]
                    if (-not [string]::IsNullOrWhiteSpace($possiblePath)) {
                        Write-Host "Checking IconLocation path: '$possiblePath'"
                        if (Test-Path $possiblePath) {
                            $iconPath = $possiblePath
                        } else {
                            Write-Host "IconLocation path does not exist."
                        }
                    } else {
                        Write-Host "IconLocation path is empty."
                    }
                }
                
                # Fallback to TargetPath
                if (-not $iconPath) {
                    Write-Host "Falling back to TargetPath..."
                    if ($shortcut.TargetPath -and (Test-Path $shortcut.TargetPath)) {
                        $iconPath = $shortcut.TargetPath
                    } else {
                        Write-Host "TargetPath is invalid or does not exist."
                    }
                }
                
                if ($iconPath) {
                    Write-Host "Attempting extraction from: '$iconPath'"
                    Add-Type -AssemblyName System.Drawing
                    try {
                        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($iconPath)
                        if ($icon) {
                            Write-Host "SUCCESS: Icon extracted object is valid."
                            $bitmap = $icon.ToBitmap()
                            Write-Host "Bitmap size: $($bitmap.Width)x$($bitmap.Height)"
                        } else {
                            Write-Host "FAILURE: ExtractAssociatedIcon returned null."
                        }
                    } catch {
                        Write-Host "FAILURE: Exception extracting icon: $_"
                    }
                } else {
                     Write-Host "FAILURE: No valid path found for icon."
                }
            }
        }
    }
} else {
    Write-Host "App not found in Get-StartApps"
}
