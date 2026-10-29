param([string]$OutputDirectory)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot
$version='0.1.0'
if(-not $OutputDirectory){$OutputDirectory=Join-Path $repo ('dist\bopo-mac-fo-'+$version+'-windows-x64')}
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
if(Test-Path -LiteralPath $OutputDirectory){throw 'Output directory already exists; select a new empty directory.'}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$payload=Join-Path $OutputDirectory 'payload'
$helpers=Join-Path $payload 'helpers'
New-Item -ItemType Directory -Path $helpers -Force | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /codepage:65001 /target:winexe ('/out:'+(Join-Path $OutputDirectory 'Setup.exe')) /r:System.Windows.Forms.dll /r:System.Drawing.dll (Join-Path $repo 'src\Setup.cs')
if($LASTEXITCODE -ne 0){throw 'Setup compilation failed.'}
& $compiler /nologo /codepage:65001 /target:winexe ('/out:'+(Join-Path $helpers 'CapsSwitch.exe')) /r:System.Windows.Forms.dll (Join-Path $repo 'src\helpers\CapsSwitch.cs') (Join-Path $repo 'src\helpers\CapsGesture.cs')
if($LASTEXITCODE -ne 0){throw 'Caps helper compilation failed.'}
& $compiler /nologo /codepage:65001 /target:winexe ('/out:'+(Join-Path $helpers 'EmojiPalette.exe')) /r:System.Windows.Forms.dll /r:System.Drawing.dll (Join-Path $repo 'src\helpers\EmojiBrowser.cs')
if($LASTEXITCODE -ne 0){throw 'Emoji helper compilation failed.'}
Copy-Item -LiteralPath (Join-Path $repo 'data\catalog.tsv') -Destination $helpers
Copy-Item -LiteralPath (Join-Path $repo 'runtime\Emoji') -Destination (Join-Path $helpers 'Emoji') -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'runtime\node') -Destination (Join-Path $payload 'node') -Recurse
foreach($arch in @('x64','x86')){
    $target=Join-Path $payload ('native\'+$arch)
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $repo ('build\native-'+$arch+'\PIMETextService-Mac.dll')) -Destination (Join-Path $target ('BopoMacFo-'+$version+'.dll'))
}
foreach($directory in @('installer','LICENSES','docs')){Copy-Item -LiteralPath (Join-Path $repo $directory) -Destination $OutputDirectory -Recurse}
foreach($file in @('README.md','THIRD_PARTY_NOTICES.md','LICENSE')){Copy-Item -LiteralPath (Join-Path $repo $file) -Destination $OutputDirectory}
$files=@(Get-ChildItem -LiteralPath $OutputDirectory -File -Recurse | Sort-Object FullName | ForEach-Object {@{path=$_.FullName.Substring($OutputDirectory.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}})
$manifest=[ordered]@{name='bopo MAC fo';version=$version;pime=@{url='https://github.com/EasyIME/PIME/releases/download/v1.3.0-stable/PIME-1.3.0-stable-setup.exe';sha256='6B2E288B95085A52F378F023FB17128F5B1389A3CDAE078C7E4D47C1B4E9DC35'};files=$files}
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'manifest.json'),($manifest|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
Import-Module (Join-Path $repo 'installer\Package.psm1') -Force
$null=Test-Package -Root $OutputDirectory
$zip=$OutputDirectory+'.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($OutputDirectory,$zip,[IO.Compression.CompressionLevel]::Optimal,$false)
Get-Item -LiteralPath $zip | Select-Object FullName,Length
