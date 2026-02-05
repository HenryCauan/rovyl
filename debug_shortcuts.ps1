$paths = @([System.Environment]::GetFolderPath('CommonStartMenu'), [System.Environment]::GetFolderPath('StartMenu'))
Write-Host "Scanning paths: $paths"
$shortcuts = Get-ChildItem -Path $paths -Recurse -Include *.lnk -ErrorAction SilentlyContinue
Write-Host "Total shortcuts found: $($shortcuts.Count)"

$shell = New-Object -ComObject WScript.Shell
$count = 0

foreach ($s in $shortcuts) {
    if ($count -ge 10) { break }
    try {
        $link = $shell.CreateShortcut($s.FullName)
        $target = $link.TargetPath
        
        Write-Host "Shortcut: $($s.Name)"
        Write-Host "  Target: $target"
        
        if ($target -match '\.exe$') {
            Write-Host "  Is EXE: Yes"
        } else {
            Write-Host "  Is EXE: No"
        }
        
        if (Test-Path $target) {
            Write-Host "  Exists: Yes"
        } else {
            Write-Host "  Exists: No (or access denied)"
        }
        $count++
    } catch {
        Write-Host "  Error resolving: $($_.Exception.Message)"
    }
    Write-Host "----------------"
}
