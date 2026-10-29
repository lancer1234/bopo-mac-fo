$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot '..\installer\Package.psm1') -Force
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('BopoMacFo-test-'+[Guid]::NewGuid())
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
    $file=Join-Path $temporary 'hello.txt';[IO.File]::WriteAllText($file,'original')
    $manifest=@{files=@(@{path='hello.txt';sha256=(Get-FileHash -LiteralPath $file).Hash})}
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $temporary 'manifest.json')
    $null=Test-Package -Root $temporary
    [IO.File]::WriteAllText($file,'modified');$rejected=$false
    try{$null=Test-Package -Root $temporary}catch{$rejected=$true}
    if(-not $rejected){throw 'Corrupt payload was accepted.'}
    $manifest.files[0].path='missing.txt';$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $temporary 'manifest.json')
    $rejected=$false;try{$null=Test-Package -Root $temporary}catch{$rejected=$true}
    if(-not $rejected){throw 'Missing payload was accepted.'}
    $manifest.files[0].path='..\escape.txt';$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $temporary 'manifest.json')
    $rejected=$false;try{$null=Test-Package -Root $temporary}catch{$rejected=$true}
    if(-not $rejected){throw 'Path escape was accepted.'}
    $config=Get-DefaultConfig
    if($config.shift_key_toggle_alphabet_mode -ne $false -or $config.select_phrase -ne 'before_cursor'){throw 'Invalid default keyboard behavior.'}
    'PASS package integrity, path confinement, and keyboard defaults'
}finally{if([IO.Path]::GetFullPath($temporary).StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase)){Remove-Item -LiteralPath $temporary -Recurse -Force}}
