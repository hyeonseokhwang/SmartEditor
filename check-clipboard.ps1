Add-Type -AssemblyName System.Windows.Forms
$cb = [System.Windows.Forms.Clipboard]::GetDataObject()
if (-not $cb) { Write-Host "No clipboard data"; exit }

$formats = $cb.GetFormats()
Write-Host "=== Clipboard Formats ==="
foreach ($f in $formats) {
    $d = $cb.GetData($f)
    if ($d -is [string]) {
        Write-Host "$f : $($d.Length) chars"
    } elseif ($d -is [System.IO.MemoryStream]) {
        Write-Host "$f : $($d.Length) bytes (stream)"
    } else {
        Write-Host "$f : (other type)"
    }
}

# Save HTML format
$html = $cb.GetData("HTML Format")
if ($html -and $html -is [string]) {
    [System.IO.File]::WriteAllText("G:\WorkSpace\HomePage\Hanwool\clipboard-html.txt", $html.Substring(0, [Math]::Min($html.Length, 500000)), [System.Text.Encoding]::UTF8)
    Write-Host "`n=== HTML saved (first 500K chars) ==="

    # Count data-hwpjson
    if ($html -match 'data-hwpjson') {
        Write-Host "HWP JSON block FOUND"
    } else {
        Write-Host "HWP JSON block NOT found"
    }

    # Count file:/// URLs
    $fileUrls = [regex]::Matches($html, 'file:///[^"''>\s]+')
    Write-Host "file:/// URLs: $($fileUrls.Count)"
    foreach ($u in $fileUrls) {
        $name = $u.Value.Split('/')[-1]
        Write-Host "  - $name"
    }

    # Count data:image
    $dataImgs = [regex]::Matches($html, 'data:image/')
    Write-Host "data:image/ occurrences: $($dataImgs.Count)"

    # Count img tags
    $imgTags = [regex]::Matches($html, '<img\b')
    Write-Host "img tags: $($imgTags.Count)"
}

# Check RTF
$rtf = $cb.GetData("Rich Text Format")
if ($rtf -is [System.IO.MemoryStream]) {
    $reader = New-Object System.IO.StreamReader($rtf)
    $rtfText = $reader.ReadToEnd()
    Write-Host "`n=== RTF ==="
    Write-Host "RTF size: $($rtfText.Length) chars"

    $picts = [regex]::Matches($rtfText, '\\pict\b')
    Write-Host "\pict blocks: $($picts.Count)"

    # Check each pict format
    foreach ($p in $picts) {
        $snippet = $rtfText.Substring($p.Index, [Math]::Min(300, $rtfText.Length - $p.Index))
        if ($snippet -match '\\pngblip') { Write-Host "  - PNG at offset $($p.Index)" }
        elseif ($snippet -match '\\jpegblip|\\jpgblip') { Write-Host "  - JPEG at offset $($p.Index)" }
        elseif ($snippet -match '\\emfblip') { Write-Host "  - EMF at offset $($p.Index)" }
        elseif ($snippet -match '\\wmetafile') { Write-Host "  - WMF at offset $($p.Index)" }
        else { Write-Host "  - UNKNOWN at offset $($p.Index)" }
    }
} elseif ($rtf -is [string]) {
    Write-Host "`n=== RTF (string) ==="
    Write-Host "RTF size: $($rtf.Length) chars"
}
