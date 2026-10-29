param([switch]$Rollback)
$ErrorActionPreference='Stop'
$principal=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
    $child=Start-Process -FilePath (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "'+$PSCommandPath+'"') -Verb RunAs -Wait -PassThru -WindowStyle Hidden
    exit $child.ExitCode
}
$statePath=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'bopo-mac-fo\installation.json'
if(-not(Test-Path -LiteralPath $statePath)){throw 'Installation backup was not found. No settings were changed.'}
$state=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$expected=Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'PIME'
if([IO.Path]::GetFullPath($state.PimeRoot) -ne [IO.Path]::GetFullPath($expected)){throw 'Invalid saved installation path.'}
foreach($process in Get-CimInstance Win32_Process){if($process.ExecutablePath -and ($process.ExecutablePath.StartsWith($state.ProductRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or $process.ExecutablePath -eq (Join-Path $expected 'node\node.exe') -or $process.ExecutablePath -eq (Join-Path $expected 'PIMELauncher.exe'))){Stop-Process -Id $process.ProcessId -ErrorAction SilentlyContinue}}
if($state.HadNode){Copy-Item -Path (Join-Path $state.Backup 'node\*') -Destination (Join-Path $expected 'node') -Recurse -Force}
foreach($arch in @('x64','x86')){
    $original=$state.Dlls.$arch
    if(-not $original -or -not(Test-Path -LiteralPath $original)){$original=Join-Path $expected ($arch+'\PIMETextService.dll')}
    if(Test-Path -LiteralPath $original){
        $reg=if($arch -eq 'x64'){Join-Path $env:WINDIR 'System32\regsvr32.exe'}else{Join-Path $env:WINDIR 'SysWOW64\regsvr32.exe'}
        $process=Start-Process -FilePath $reg -ArgumentList ('/s "'+$original+'"') -WindowStyle Hidden -Wait -PassThru
        if($process.ExitCode -ne 0){throw "Could not restore the original $arch input service."}
    }
}
$config=Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'PIME\mcbopomofo\config.json'
if($state.HadConfig){Copy-Item -LiteralPath (Join-Path $state.Backup 'config.json') -Destination $config -Force}
. (Join-Path $PSScriptRoot 'Profiles.ps1')
foreach($profile in $state.ProfileStates){[BopoProfileState]::Restore($profile.Clsid,$profile.Profile,($profile.Present -and $profile.Enabled))}
$list=$null
foreach($language in $state.Languages){$entry=New-WinUserLanguageList $language.Language;$entry[0].InputMethodTips.Clear();foreach($tip in $language.Tips){$entry[0].InputMethodTips.Add($tip)};if($null -eq $list){$list=$entry}else{$list.Add($entry[0])}}
if($null -ne $list){Set-WinUserLanguageList $list -Force}
if($state.DefaultTip){Set-WinDefaultInputMethodOverride -InputTip $state.DefaultTip}else{Set-WinDefaultInputMethodOverride}
$run='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
foreach($property in $state.Startup.PSObject.Properties){if($property.Value){New-ItemProperty -LiteralPath $run -Name $property.Name -PropertyType String -Value $property.Value -Force | Out-Null}else{Remove-ItemProperty -LiteralPath $run -Name $property.Name -ErrorAction SilentlyContinue}}
Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\BopoMacFo' -ErrorAction SilentlyContinue
Start-Process -FilePath (Join-Path $expected 'PIMELauncher.exe') -WindowStyle Hidden
foreach($property in $state.Startup.PSObject.Properties){if($property.Value -and $property.Value -match '^"([^"]+\.exe)"(.*)$'){$exe=$Matches[1];$arguments=$Matches[2].Trim();if(Test-Path -LiteralPath $exe){if($arguments){Start-Process -FilePath $exe -ArgumentList $arguments -WindowStyle Hidden}else{Start-Process -FilePath $exe -WindowStyle Hidden}}}}
'Original settings restored. Personal words, backup files, and the PIME prerequisite are retained. Reopen apps or sign out to unload DLLs.'
if(-not $Rollback){Add-Type -AssemblyName System.Windows.Forms;[void][Windows.Forms.MessageBox]::Show('Original input settings restored. Reopen applications or sign out to unload the old service. Personal words and backups were kept.','bopo MAC fo')}
