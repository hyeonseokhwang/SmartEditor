Add-Type -AssemblyName System.Windows.Forms
$cb = [System.Windows.Forms.Clipboard]::GetDataObject()
$html = $cb.GetData("HTML Format")
if ($html) {
    [System.IO.File]::WriteAllText("G:\WorkSpace\HomePage\Hanwool\clipboard-html-full.txt", $html, [System.Text.Encoding]::UTF8)
    Write-Host "Saved full HTML: $($html.Length) chars"
} else {
    Write-Host "No HTML data"
}
