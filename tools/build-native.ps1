param([ValidateSet('x64','x86')][string]$Architecture='x64',[Parameter(Mandatory)][string]$CompilerRoot,[Parameter(Mandatory)][string]$SdkHeadersDirectory)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot
$sourceRoot=Join-Path $taskRoot 'upstream\PIME'
$compilerRoot=Join-Path $CompilerRoot 'bin'
$target=if($Architecture -eq 'x64'){'x86_64'}else{'i686'}
$buildRoot=Join-Path $taskRoot "build\native-$Architecture"
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$resource=Get-Content (Join-Path $sourceRoot 'PIMETextService\PIMETextService.rc.in') -Raw
$resource=$resource.Replace('@PIME_VERSION_MAJOR@','1').Replace('@PIME_VERSION_MINOR@','3').Replace('@PIME_VERSION_PATCH@','1')
[IO.File]::WriteAllText((Join-Path $buildRoot 'PIMETextService.rc'),$resource)
& (Join-Path $compilerRoot "$target-w64-mingw32-windres.exe") '-I' (Join-Path $sourceRoot 'PIMETextService') (Join-Path $buildRoot 'PIMETextService.rc') '-O' 'coff' '-o' (Join-Path $buildRoot 'resources.o')
if($LASTEXITCODE -ne 0){throw 'Resource compilation failed'}
$sources=@()
foreach($relative in @('libIME2\src','PIMETextService')) {
    $component=Join-Path $sourceRoot $relative
    foreach($line in Get-Content (Join-Path $component 'CMakeLists.txt')) {
        if($line -match '^\s*([A-Za-z0-9_]+\.cpp)\s*$') { $sources+=Join-Path $component $Matches[1] }
    }
}
$sources+=@(Get-ChildItem (Join-Path $sourceRoot 'jsoncpp\src\lib_json') -Filter '*.cpp' | ForEach-Object FullName)
$sources+=Join-Path $sourceRoot 'PIMETextService\ThemeGuids.cpp'
$arguments=@('-std=c++14','-O1','-shared','-static','-fms-extensions','-D_UNICODE','-DUNICODE','-DWIN32_LEAN_AND_MEAN','-D_CRT_SECURE_NO_WARNINGS','-D_WIN32_WINNT=0x0A00','-include',(Join-Path $PSScriptRoot 'CompilerCompat.h'))
$arguments+=@('-I',$PSScriptRoot,'-I',$SdkHeadersDirectory,'-I',$sourceRoot,'-I',(Join-Path $sourceRoot 'jsoncpp\include'))
$arguments+=$sources
$arguments+=@((Join-Path $buildRoot 'resources.o'),(Join-Path $sourceRoot 'PIMETextService\PIMETextService.def'),'-o',(Join-Path $buildRoot 'PIMETextService-Mac.dll'))
$arguments+=@(('-ffile-prefix-map='+$taskRoot+'=.'),('-fdebug-prefix-map='+$taskRoot+'=.'),'-lole32','-loleaut32','-luuid','-lshlwapi','-limm32','-lgdi32','-lgdiplus','-luser32','-ladvapi32','-lversion','-lcomctl32','-Wl,--error-limit=0')
& (Join-Path $compilerRoot "$target-w64-mingw32-clang++.exe") @arguments *> (Join-Path $buildRoot 'build.log')
if($LASTEXITCODE -ne 0){Get-Content (Join-Path $buildRoot 'build.log') -Tail 60; throw 'Native UI build failed'}
Get-Item (Join-Path $buildRoot 'PIMETextService-Mac.dll') | Select-Object FullName,Length
