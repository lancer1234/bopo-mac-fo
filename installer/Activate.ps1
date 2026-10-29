$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
[ComImport,Guid("71C6E74C-0F28-11D8-A82A-00065B84435C"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface BopoProfileManager {
 [PreserveSig]int ActivateProfile(uint type,ushort lang,ref Guid clsid,ref Guid profile,IntPtr hkl,uint flags);
}
public static class BopoActivation {
 public static void Run(){
  object instance=Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("33C53A50-F456-4884-B049-85FD643ECFED")));
  Guid clsid=new Guid("35F67E9D-A54D-4177-9697-8B0AB71A9E04"),profile=new Guid("5340C1D9-706E-4B6B-B022-2E763FA5F674");
  Marshal.ThrowExceptionForHR(((BopoProfileManager)instance).ActivateProfile(1,0x0404,ref clsid,ref profile,IntPtr.Zero,0x20000001));
  Marshal.ReleaseComObject(instance);
 }
}
'@
[BopoActivation]::Run()
