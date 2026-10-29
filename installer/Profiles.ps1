if(-not('BopoProfileState' -as [type])){
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
[ComImport,Guid("1F02B6C5-7842-4EE6-8A0B-9A24183A95CA"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface BopoUserProfiles {
 void Register();void Unregister();void AddLanguageProfile();void RemoveLanguageProfile();void EnumInputProcessorInfo();void GetDefaultLanguageProfile();void SetDefaultLanguageProfile();void ActivateLanguageProfile();void GetActiveLanguageProfile();void GetLanguageProfileDescription();void GetCurrentLanguage();void ChangeCurrentLanguage();void GetLanguageList();void EnumLanguageProfiles();
 [PreserveSig]int EnableLanguageProfile(ref Guid clsid,ushort lang,ref Guid profile,[MarshalAs(UnmanagedType.Bool)]bool enable);
 [PreserveSig]int IsEnabledLanguageProfile(ref Guid clsid,ushort lang,ref Guid profile,[MarshalAs(UnmanagedType.Bool)]out bool enabled);
}
public sealed class BopoProfileRecord {public string Clsid,Profile;public bool Present,Enabled;}
public static class BopoProfileState {
 static BopoUserProfiles Open(){return (BopoUserProfiles)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("33C53A50-F456-4884-B049-85FD643ECFED")));}
 public static BopoProfileRecord[] Read(){
  var manager=Open();var rows=new[]{new BopoProfileRecord{Clsid="B115690A-EA02-48D5-A231-E3578D2FDF80",Profile="B2F9C502-1742-11D4-9790-0080C882687E"},new BopoProfileRecord{Clsid="35F67E9D-A54D-4177-9697-8B0AB71A9E04",Profile="F80736AA-28DB-423A-92C9-5540F501C939"},new BopoProfileRecord{Clsid="35F67E9D-A54D-4177-9697-8B0AB71A9E04",Profile="5340C1D9-706E-4B6B-B022-2E763FA5F674"}};
  foreach(var row in rows){Guid clsid=new Guid(row.Clsid),profile=new Guid(row.Profile);bool enabled;row.Present=manager.IsEnabledLanguageProfile(ref clsid,0x0404,ref profile,out enabled)>=0;row.Enabled=enabled;}
  Marshal.ReleaseComObject(manager);return rows;
 }
 public static void Restore(string clsidText,string profileText,bool enabled){var manager=Open();Guid clsid=new Guid(clsidText),profile=new Guid(profileText);bool current;if(manager.IsEnabledLanguageProfile(ref clsid,0x0404,ref profile,out current)>=0)Marshal.ThrowExceptionForHR(manager.EnableLanguageProfile(ref clsid,0x0404,ref profile,enabled));Marshal.ReleaseComObject(manager);}
}
'@
}
