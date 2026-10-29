using System;
public static class CapsGestureTest {
 static void Equal(ushort expected,ushort actual){if(expected!=actual)throw new Exception("Gesture test failed: "+expected+" != "+actual);}
 public static void Main(){
  var g=new CapsGesture();g.Down(0);Equal(0,g.Tick(499));Equal(129,g.Up(100));Equal(0,g.Up(101));
  g=new CapsGesture();g.Down(0);Equal(20,g.Tick(500));Equal(0,g.Tick(700));Equal(0,g.Up(900));
  g=new CapsGesture();g.Down(0);g.Down(400);Equal(20,g.Tick(500));Equal(0,g.Up(501));
  g=new CapsGesture();g.Down(0);g.Cancel();Equal(0,g.Tick(600));Equal(0,g.Up(800));
  g=new CapsGesture();g.Down(0);Equal(20,g.Up(501));
  Console.WriteLine("PASS: short press, immediate hold, repeat, cancellation, and late timer delivery");
 }
}
