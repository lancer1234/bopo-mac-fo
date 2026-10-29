param([switch]$Exclusive,[switch]$ValidateOnly,[string]$UserSid)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Package.psm1') -Force
$packageRoot=Split-Path $PSScriptRoot
$manifest=Test-Package -Root $packageRoot
if($ValidateOnly){'PASS package validation; no system settings changed';exit 0}
if(-not[Environment]::Is64BitOperatingSystem){throw 'This preview requires Windows x64.'}
if($UserSid -and [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne $UserSid){throw 'Please install using the same Windows administrator account.'}
$principal=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Administrator approval is required to register the input method.'}
$pime=Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'PIME'
$product=Join-Path $pime 'bopo-mac-fo'
$stateRoot=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'bopo-mac-fo'
if(Test-Path -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\BopoMacFo'){throw 'bopo MAC fo is already installed. Uninstall the preview before reinstalling.'}
$backup=Join-Path $stateRoot ('backup\'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Start-Transcript -Path (Join-Path $stateRoot 'setup.log') -Append -Force | Out-Null
. (Join-Path $PSScriptRoot 'Profiles.ps1')
$statePath=Join-Path $stateRoot 'installation.json'
$config=Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'PIME\mcbopomofo\config.json'
$run='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
function Register-Dll([string]$Architecture,[string]$Path){
    $registrar=if($Architecture -eq 'x64'){Join-Path $env:WINDIR 'System32\regsvr32.exe'}else{Join-Path $env:WINDIR 'SysWOW64\regsvr32.exe'}
    $process=Start-Process -FilePath $registrar -ArgumentList ('/s "'+$Path+'"') -WindowStyle Hidden -Wait -PassThru
    if($process.ExitCode -ne 0){throw "Registration failed for $Architecture ($($process.ExitCode))."}
}
function Stop-PimeProcesses {
    foreach($process in Get-CimInstance Win32_Process){
        if($process.ExecutablePath -and ($process.ExecutablePath -eq (Join-Path $pime 'PIMELauncher.exe') -or $process.ExecutablePath -eq (Join-Path $pime 'node\node.exe') -or $process.ExecutablePath.StartsWith($product+'\',[StringComparison]::OrdinalIgnoreCase))){Stop-Process -Id $process.ProcessId -ErrorAction SilentlyContinue}
    }
}
$languageList=Get-WinUserLanguageList
$languages=@(for($i=0;$i -lt $languageList.Count;$i++){[ordered]@{Language=$languageList[$i].LanguageTag;Tips=@($languageList[$i].InputMethodTips)}})
$startup=[ordered]@{}
foreach($name in @('BopoMacFoCapsSwitch','BopoMacFoEmojiPalette','McBopomofoCapsSwitch','McBopomofoEmojiPalette')){$startup[$name]=(Get-ItemProperty -LiteralPath $run -Name $name -ErrorAction SilentlyContinue).$name}
$state=[ordered]@{Version=$manifest.version;Backup=$backup;PimeRoot=$pime;ProductRoot=$product;HadNode=(Test-Path -LiteralPath (Join-Path $pime 'node'));HadConfig=(Test-Path -LiteralPath $config);Languages=$languages;DefaultTip=(Get-WinDefaultInputMethodOverride).InputMethodTip;Startup=$startup;Dlls=[ordered]@{}}
$state.ProfileStates=@([BopoProfileState]::Read())
foreach($arch in @('x64','x86')){
    $registry=if($arch -eq 'x64'){'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\CLSID\{35F67E9D-A54D-4177-9697-8B0AB71A9E04}\InprocServer32'}else{'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\WOW6432Node\CLSID\{35F67E9D-A54D-4177-9697-8B0AB71A9E04}\InprocServer32'}
    $state.Dlls[$arch]=if(Test-Path -LiteralPath $registry){(Get-Item -LiteralPath $registry).GetValue('')}else{''}
}
if($state.HadConfig){Copy-Item -LiteralPath $config -Destination (Join-Path $backup 'config.json')}
if($state.HadNode){Copy-Item -LiteralPath (Join-Path $pime 'node') -Destination (Join-Path $backup 'node') -Recurse}
[IO.File]::WriteAllText($statePath,($state|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
try {
    if(-not(Test-Path -LiteralPath (Join-Path $pime 'PIMELauncher.exe'))){
        Write-Host 'Downloading the official PIME prerequisite...'
        [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
        $setup=Join-Path $backup 'PIME-setup.exe'
        Invoke-WebRequest -UseBasicParsing -Uri $manifest.pime.url -OutFile $setup
        if((Get-FileHash -LiteralPath $setup).Hash -ne $manifest.pime.sha256){throw 'Official PIME installer checksum mismatch.'}
        $process=Start-Process -FilePath $setup -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
        if($process.ExitCode -ne 0){throw 'PIME prerequisite installation failed.'}
    }
    Stop-PimeProcesses
    New-Item -ItemType Directory -Path $product -Force | Out-Null
    Copy-Item -Path (Join-Path $packageRoot 'payload\helpers\*') -Destination $product -Recurse -Force
    New-Item -ItemType Directory -Path (Join-Path $pime 'node') -Force | Out-Null
    Copy-Item -Path (Join-Path $packageRoot 'payload\node\*') -Destination (Join-Path $pime 'node') -Recurse -Force
    foreach($arch in @('x64','x86')){
        $target=Join-Path $pime ($arch+'\BopoMacFo-'+$manifest.version+'.dll')
        $source=Join-Path $packageRoot ('payload\native\'+$arch+'\BopoMacFo-'+$manifest.version+'.dll')
        if(-not(Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $target).Hash){Copy-Item -LiteralPath $source -Destination $target -Force}
        Register-Dll $arch $target
    }
    $current=if(Test-Path -LiteralPath $config){Get-Content -LiteralPath $config -Raw | ConvertFrom-Json}else{[pscustomobject]@{}}
    $defaults=Get-DefaultConfig
    foreach($key in $defaults.Keys){$current | Add-Member -NotePropertyName $key -NotePropertyValue $defaults[$key] -Force}
    New-Item -ItemType Directory -Path (Split-Path $config) -Force | Out-Null
    [IO.File]::WriteAllText($config,($current|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
    # The native candidate renderer uses this small fixed cache; full images stay
    # beside the palette executable. No personal words or history are copied.
    $imageCache=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'McBopomofoCustom\Emoji'
    New-Item -ItemType Directory -Path $imageCache -Force | Out-Null
    for($i=0;$i -lt 27;$i++){Copy-Item -LiteralPath (Join-Path $product "Emoji\$i.png") -Destination (Join-Path $imageCache "$i.png") -Force}
    foreach($name in @('McBopomofoCapsSwitch','McBopomofoEmojiPalette')){Remove-ItemProperty -LiteralPath $run -Name $name -ErrorAction SilentlyContinue}
    Get-Process CapsSwitch,EmojiPalette -ErrorAction SilentlyContinue | Stop-Process -ErrorAction SilentlyContinue
    New-ItemProperty -LiteralPath $run -Name BopoMacFoCapsSwitch -PropertyType String -Value ('"'+$product+'\CapsSwitch.exe"') -Force | Out-Null
    New-ItemProperty -LiteralPath $run -Name BopoMacFoEmojiPalette -PropertyType String -Value ('"'+$product+'\EmojiPalette.exe" --hidden') -Force | Out-Null
    $tip='0404:{35F67E9D-A54D-4177-9697-8B0AB71A9E04}{5340C1D9-706E-4B6B-B022-2E763FA5F674}'
    if($Exclusive){$languageList=New-WinUserLanguageList 'zh-Hant-TW';$languageList[0].InputMethodTips.Clear();$languageList[0].InputMethodTips.Add($tip)}else{
        $index=-1;for($i=0;$i -lt $languageList.Count;$i++){if($languageList[$i].LanguageTag -eq 'zh-Hant-TW'){$index=$i}}
        if($index -lt 0){$additional=New-WinUserLanguageList 'zh-Hant-TW';$languageList.Add($additional[0]);$index=$languageList.Count-1}
        if(-not $languageList[$index].InputMethodTips.Contains($tip)){$languageList[$index].InputMethodTips.Add($tip)}
    }
    Set-WinUserLanguageList $languageList -Force
    Set-WinDefaultInputMethodOverride -InputTip $tip
    if($Exclusive){& (Join-Path $PSScriptRoot 'Disable-Other-Profiles.ps1')}
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Uninstall.ps1'),(Join-Path $PSScriptRoot 'Activate.ps1'),(Join-Path $PSScriptRoot 'Profiles.ps1') -Destination $product -Force
    Copy-Item -LiteralPath (Join-Path $packageRoot 'README.md'),(Join-Path $packageRoot 'THIRD_PARTY_NOTICES.md') -Destination $product -Force
    Copy-Item -LiteralPath (Join-Path $packageRoot 'LICENSES') -Destination $product -Recurse -Force
    $uninstall='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\BopoMacFo'
    New-Item -Path $uninstall -Force | Out-Null
    $properties=@{DisplayName='bopo MAC fo';DisplayVersion=$manifest.version;Publisher='lancer1234 and upstream contributors';InstallLocation=$product;URLInfoAbout='https://github.com/lancer1234/bopo-mac-fo';UninstallString=('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "'+$product+'\Uninstall.ps1"')}
    foreach($key in $properties.Keys){New-ItemProperty -LiteralPath $uninstall -Name $key -PropertyType String -Value $properties[$key] -Force | Out-Null}
    'Installation complete. Reopen applications to load the new input service.'
}catch{
    Write-Error -ErrorRecord $_ -ErrorAction Continue
    & (Join-Path $PSScriptRoot 'Uninstall.ps1') -Rollback
    exit 1
}
