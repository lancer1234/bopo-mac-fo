Set-StrictMode -Version Latest
function Test-Package {
    param([Parameter(Mandatory)][string]$Root)
    $base=[IO.Path]::GetFullPath($Root).TrimEnd('\')+'\'
    $manifest=Get-Content -LiteralPath (Join-Path $Root 'manifest.json') -Raw | ConvertFrom-Json
    foreach($entry in $manifest.files){
        $path=[IO.Path]::GetFullPath((Join-Path $Root $entry.path))
        if(-not $path.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid package path.'}
        if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw "Package file missing: $($entry.path)"}
        if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $entry.sha256){throw "Package file checksum mismatch: $($entry.path)"}
    }
    return $manifest
}
function Get-DefaultConfig {
    [ordered]@{half_width_punctuation=$false;repeated_punctuation_choose_candidate=$false;layout='standard';move_cursor=$true;shift_key_toggle_alphabet_mode=$false;moving_cursor_option=0;bopomofo_font_annotation_support_enabled=$false;candidate_keys='123456789';select_phrase='before_cursor';esc_key_clear_entire_buffer=$false;by_default_deactivated=$false;beep_on_error=$false;candidate_font_size=11;chineseConversion=$false;ctrl_enter_option=0;candidate_keys_count=9;input_mode='use_mcbopomofo';letter_mode='upper';candidate_font_name='Microsoft JhengHei UI'}
}
Export-ModuleMember -Function Test-Package,Get-DefaultConfig
