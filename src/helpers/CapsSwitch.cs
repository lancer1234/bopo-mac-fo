using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
public static class CapsSwitch {
 delegate IntPtr HookProc(int code,IntPtr w,IntPtr l);
 [StructLayout(LayoutKind.Sequential)] struct KeyData { public uint key,scan,flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] struct KeyboardInput { public ushort key,scan;public uint flags,time;public UIntPtr extra; }
 [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public KeyboardInput keyboard; [FieldOffset(0)] public MouseInput mouse; }
 [StructLayout(LayoutKind.Sequential)] struct MouseInput {public int x,y;public uint data,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)] struct Input {public uint type;public InputUnion data;}
 [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id,HookProc callback,IntPtr module,uint thread);
 [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
 [DllImport("kernel32.dll",CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
 [DllImport("user32.dll")] static extern uint SendInput(uint count,Input[] inputs,int size);
 static readonly HookProc callback=ProcessKey;
 static IntPtr hook;
 static readonly CapsGesture gesture=new CapsGesture();
 static readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer { Interval=10 };
 static long Now {get{return Stopwatch.GetTimestamp()*1000/Stopwatch.Frequency;}}
 static void Send(ushort key) {
  var inputs=new Input[2];
  for(int i=0;i<2;i++){inputs[i].type=1;inputs[i].data.keyboard.key=key;inputs[i].data.keyboard.flags=(uint)(i==0?0:2);inputs[i].data.keyboard.extra=new UIntPtr(0x4D434250);}
  SendInput(2,inputs,Marshal.SizeOf(typeof(Input)));
 }
 static IntPtr ProcessKey(int code,IntPtr w,IntPtr l) {
  if(code>=0){var data=(KeyData)Marshal.PtrToStructure(l,typeof(KeyData));
   if(data.extra.ToUInt64()!=0x4D434250){bool down=w.ToInt64()==0x100||w.ToInt64()==0x104;
    if(data.key==20){
     if(down){gesture.Down(Now);timer.Start();}
     else {timer.Stop();ushort action=gesture.Up(Now);if(action!=0)Send(action);}
     return new IntPtr(1);
    }
    if(gesture.Held&&down){gesture.Cancel();timer.Stop();}
   }
  }
  return CallNextHookEx(hook,code,w,l);
 }
 [STAThread] public static void Main(){bool created;using(var mutex=new Mutex(true,"Local\\McBopomofoCapsSwitch",out created)){
  if(!created)return;timer.Tick+=delegate {ushort action=gesture.Tick(Now);if(action!=0){timer.Stop();Send(action);}};hook=SetWindowsHookEx(13,callback,GetModuleHandle(null),0);if(hook==IntPtr.Zero)return;
  try{Application.Run();}finally{UnhookWindowsHookEx(hook);}
 }}
}
