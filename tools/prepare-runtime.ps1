param([string]$NpmCommand='npm')
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot
$runtime=Join-Path $repo 'runtime\node'
$build=Join-Path $repo 'build\downloads'
New-Item -ItemType Directory -Path $runtime,$build -Force | Out-Null
$version='22.14.0';$name="node-v$version-win-x64.zip"
$base="https://nodejs.org/dist/v$version/"
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -UseBasicParsing -Uri ($base+'SHASUMS256.txt') -OutFile (Join-Path $build 'node-SHASUMS256.txt')
$checksum=(Get-Content (Join-Path $build 'node-SHASUMS256.txt') | Where-Object {$_ -match ('\s'+[regex]::Escape($name)+'$')}) -split '\s+'
if($checksum.Count -lt 2){throw 'Official Node checksum was not found.'}
$archive=Join-Path $build $name
if(-not(Test-Path -LiteralPath $archive)){Invoke-WebRequest -UseBasicParsing -Uri ($base+$name) -OutFile $archive}
if((Get-FileHash -LiteralPath $archive).Hash -ne $checksum[0]){throw 'Node archive checksum mismatch.'}
Expand-Archive -LiteralPath $archive -DestinationPath $build -Force
Copy-Item -LiteralPath (Join-Path $build "node-v$version-win-x64\node.exe") -Destination $runtime -Force
Copy-Item -Path (Join-Path $repo 'upstream\NIME-server\*') -Destination $runtime -Force
Push-Location $runtime
try{& $NpmCommand ci --omit=dev --ignore-scripts;if($LASTEXITCODE -ne 0){throw 'NIME dependencies could not be installed.'}}finally{Pop-Location}
$engine=Join-Path $repo 'upstream\McBopomofoWeb\output\pime'
$ime=Join-Path $runtime 'input_methods\mcbopomofo'
New-Item -ItemType Directory -Path $ime -Force | Out-Null
foreach($file in @('index.js','index.js.LICENSE.txt','icon.ico')){Copy-Item -LiteralPath (Join-Path $engine $file) -Destination $ime -Force}
Copy-Item -LiteralPath (Join-Path $engine 'icons') -Destination $ime -Recurse -Force
$info=[ordered]@{name='ㄅㄆMac ㄈ (bopo MAC fo)';version='0.1.0';guid='{5340c1d9-706e-4b6b-b022-2e763fa5f674}';locale='zh-Hant-TW';fallbackLocale='zh-TW';icon='icon.ico';win8_icon='';moduleName='index';serviceName='';configTool='';configToolParams='';configToolDir=''}
[IO.File]::WriteAllText((Join-Path $ime 'ime.json'),($info|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
'Runtime prepared; use tools/download-emoji.py to prepare images.'
