public sealed class CapsGesture {
 public bool Held {get;private set;}
 bool used,longSent; long start;
 public void Down(long now) {if(!Held){Held=true;used=false;longSent=false;start=now;}}
 public void Cancel() {used=true;}
 public ushort Tick(long now) {
  if(Held&&!used&&!longSent&&now-start>=500){longSent=true;return 20;}
  return 0;
 }
 public ushort Up(long now) {
  if(!Held)return 0;
  ushort action=Tick(now);
  if(!used&&!longSent)action=129;
  Held=false;return action;
 }
}
