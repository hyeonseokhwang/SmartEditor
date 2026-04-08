Add-Type -AssemblyName System.Windows.Forms
$cb = [System.Windows.Forms.Clipboard]::GetDataObject()
$html = $cb.GetData("HTML Format")

if (-not $html) { Write-Host "No HTML in clipboard"; exit }

# Find data-hwpjson block
$m = [regex]::Match($html, '<!--\[data-hwpjson\]\s*(\{[\s\S]*?\})\s*-->')
if (-not $m.Success) { Write-Host "No HWP JSON found"; exit }

$json = $m.Groups[1].Value
Write-Host "HWP JSON length: $($json.Length) chars"

# Find ALL bidt key-value pairs
$bidtMatches = [regex]::Matches($json, '"bidt"\s*:\s*\{([^}]*)\}')
Write-Host "bidt blocks: $($bidtMatches.Count)"

$allBidtKeys = @()
foreach ($bt in $bidtMatches) {
    $inner = $bt.Groups[1].Value
    # Extract key names (not values which are base64)
    $keyMatches = [regex]::Matches($inner, '"([^"]+)"\s*:')
    foreach ($km in $keyMatches) {
        $key = $km.Groups[1].Value
        if ($key.Length -lt 100) {
            $allBidtKeys += $key
            Write-Host "  bidt key: $key"
        }
    }
}
Write-Host "Total unique bidt keys: $($allBidtKeys | Select-Object -Unique | Measure-Object | Select-Object -ExpandProperty Count)"

# Find bi references
$biRefs = [regex]::Matches($json, '"bi"\s*:\s*"([^"]+)"')
Write-Host "`nbi references: $($biRefs.Count)"
foreach ($br in $biRefs) {
    Write-Host "  bi: $($br.Groups[1].Value)"
}

# Find sr references
$srRefs = [regex]::Matches($json, '"sr"\s*:\s*"([^"]+)"')
Write-Host "`nsr references: $($srRefs.Count)"
foreach ($sr in $srRefs) {
    Write-Host "  sr: $($sr.Groups[1].Value)"
}

# Check which bi values match bidt keys
$uniqueBidtKeys = $allBidtKeys | Select-Object -Unique
Write-Host "`n=== Matching Analysis ==="
foreach ($br in $biRefs) {
    $biVal = $br.Groups[1].Value
    if ($uniqueBidtKeys -contains $biVal) {
        Write-Host "  bi=$biVal -> MATCHED in bidt"
    } else {
        Write-Host "  bi=$biVal -> MISSING from bidt !!!"
    }
}
foreach ($sr in $srRefs) {
    $srVal = $sr.Groups[1].Value
    if ($uniqueBidtKeys -contains $srVal) {
        Write-Host "  sr=$srVal -> MATCHED in bidt"
    } else {
        Write-Host "  sr=$srVal -> MISSING from bidt !!!"
    }
}
