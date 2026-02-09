param (
    [string]$Target
)

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing

function Get-Base64Icon {
    param ([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    try {
        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($Path)
        if ($icon) {
            $bitmap = $icon.ToBitmap()
            $stream = New-Object System.IO.MemoryStream
            $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            $bytes = $stream.ToArray()
            $base64 = [Convert]::ToBase64String($bytes)
            $stream.Close(); $stream.Dispose(); $bitmap.Dispose(); $icon.Dispose()
            return "data:image/png;base64,$base64"
        }
    } catch {}
    return $null
}

function Get-UWPIconFromPackage {
    param ([string]$PackageFamilyName)
    
    $pkg = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq $PackageFamilyName }
    if (-not $pkg) { return $null }

    $installPath = $pkg.InstallLocation
    $manifestPath = Join-Path $installPath "AppxManifest.xml"
    if (-not (Test-Path $manifestPath)) { return $null }

    [xml]$xml = Get-Content $manifestPath
    
    # Priority list of logo types to check
    $logoNodes = @(
        $xml.Package.Applications.Application.VisualElements.Square150x150Logo,
        $xml.Package.Applications.Application.VisualElements.Square44x44Logo,
        $xml.Package.Applications.Application.VisualElements.Logo,
        $xml.Package.Applications.Application.VisualElements.SmallLogo,
        $xml.Package.Applications.Application.Logo
    )

    foreach ($logo in $logoNodes) {
        if ($logo) {
            $logoPath = Join-Path $installPath $logo
            
            # 1. Exact match
            if (Test-Path $logoPath) { return Get-Base64Icon -Path $logoPath }

            # 2. Heuristic Search (scales, targetsizes)
            $dir = Split-Path $logoPath
            $name = Split-Path $logoPath -LeafBase
            # Remove existing suffixes like .scale-100 if present in manifest (rare but possible)
            $name = $name -replace '\.scale-\d+', '' -replace '\.targetsize-\d+', ''
            
            # Search pattern: name*.png to find variations
            $candidates = Get-ChildItem -Path $dir -Filter "$name*.png" -Recurse -ErrorAction SilentlyContinue | 
                          Where-Object { 
                              $_.Name -match 'scale-(100|125|150|200|400)' -or 
                              $_.Name -match 'targetsize-(32|48|24|256)' -or 
                              $_.Name -match 'altform-unplated'
                          } | 
                          Sort-Object Length -Descending

            if ($candidates) {
                return Get-Base64Icon -Path $candidates[0].FullName
            }
        }
    }
    return $null
}

# 1. Try as File Path
if (Test-Path $Target) {
    $res = Get-Base64Icon -Path $Target
    if ($res) { Write-Output $res; exit }
}

# 2. Try as AUMID (FamilyName!AppId)
if ($Target -match '!') {
    $parts = $Target -split '!'
    $res = Get-UWPIconFromPackage -PackageFamilyName $parts[0]
    if ($res) { Write-Output $res; exit }
}

# 3. Fallback: Search by Name (Get-StartApps)
# "Calculator" -> "Microsoft.WindowsCalculator_..."
$apps = Get-StartApps | Where-Object { $_.Name -like "*$Target*" } | Select-Object -First 1
if ($apps) {
    $appId = $apps.AppID
    if ($appId -match '!') {
        $parts = $appId -split '!'
        $res = Get-UWPIconFromPackage -PackageFamilyName $parts[0]
        if ($res) { Write-Output $res; exit }
    }
}

# 4. Known System App Fallbacks (Hardcoded common AUMIDs)
$knownApps = @{
    "Calculator" = "Microsoft.WindowsCalculator_8wekyb3d8bbwe";
    "Microsoft Store" = "Microsoft.WindowsStore_8wekyb3d8bbwe";
    "Store" = "Microsoft.WindowsStore_8wekyb3d8bbwe";
    "WhatsApp" = "5319275A.WhatsAppDesktop_cv1g1gvanyjgm";
    "Photos" = "Microsoft.Windows.Photos_8wekyb3d8bbwe";
    "Copilot" = "Microsoft.Copilot_8wekyb3d8bbwe"  # Might vary
}

if ($knownApps.ContainsKey($Target)) {
    $res = Get-UWPIconFromPackage -PackageFamilyName $knownApps[$Target]
    if ($res) { Write-Output $res; exit }
}

