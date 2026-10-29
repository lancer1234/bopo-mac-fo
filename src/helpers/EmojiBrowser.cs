using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

// The F20/F19 product relay commits complete Unicode through our TSF service.
public sealed class EmojiBrowser : Form {
  sealed class Entry {public int Id;public string Emoji,Words,Category;}
  readonly List<Entry> all=new List<Entry>(),shown=new List<Entry>();
  readonly Dictionary<int,Image> pictures=new Dictionary<int,Image>();
  readonly string[] categories={"常用","全部","表情","人物","動物","飲食","旅遊","活動","物品","符號","旗幟"};
  readonly Font titleFont=new Font("Microsoft JhengHei UI",11,FontStyle.Bold),smallFont=new Font("Microsoft JhengHei UI",9),emojiFont=new Font("Segoe UI Emoji",21);
  readonly ToolTip tips=new ToolTip();readonly TextBox search=new TextBox();
  readonly System.Windows.Forms.Timer focusTimer=new System.Windows.Forms.Timer {Interval=100},refreshTimer=new System.Windows.Forms.Timer {Interval=2000};
  IntPtr editor;int hover=-1,page;bool hotkeyRegistered;readonly bool preview=Array.IndexOf(Environment.GetCommandLineArgs(),"--preview")>=0;string category="全部";
  const int Hotkey=0x4D45,Cell=46,LeftPad=11,TopPad=144,PageSize=42;
  [StructLayout(LayoutKind.Sequential)]struct KeyboardInput {public ushort key,scan;public uint flags,time;public UIntPtr extra;}
  [StructLayout(LayoutKind.Sequential)]struct MouseInput {public int x,y;public uint data,flags,time;public UIntPtr extra;}
  [StructLayout(LayoutKind.Explicit)]struct Union {[FieldOffset(0)]public KeyboardInput keyboard;[FieldOffset(0)]public MouseInput mouse;}
  [StructLayout(LayoutKind.Sequential)]struct Input {public uint type;public Union data;}
  [DllImport("user32.dll")]static extern uint SendInput(uint count,Input[] inputs,int size);
  [DllImport("user32.dll",SetLastError=true)]static extern bool RegisterHotKey(IntPtr hwnd,int id,uint modifiers,uint key);
  [DllImport("user32.dll")]static extern bool UnregisterHotKey(IntPtr hwnd,int id);
  [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")]static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")]static extern bool ReleaseCapture();
  [DllImport("user32.dll")]static extern IntPtr SendMessage(IntPtr hwnd,int message,IntPtr w,IntPtr l);
  [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="SendMessageW")]static extern IntPtr SendCue(IntPtr hwnd,int message,IntPtr w,string text);
  [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr hwnd,int attribute,ref int value,int size);
  protected override bool ShowWithoutActivation {get{return true;}}
  protected override CreateParams CreateParams {get{var p=base.CreateParams;p.ExStyle|=0x08000000;return p;}}
  public EmojiBrowser(){
    Text="ㄅㄆMac ㄈ · 表情符號";FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=true;TopMost=true;
    ClientSize=new Size(344,466);BackColor=Color.FromArgb(36,36,40);DoubleBuffered=true;StartPosition=FormStartPosition.Manual;
    var area=Screen.PrimaryScreen.WorkingArea;Location=new Point(area.Right-Width-24,area.Bottom-Height-24);
    foreach(string line in File.ReadAllLines(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"catalog.tsv"),System.Text.Encoding.UTF8)){var fields=line.Split('\t');if(fields.Length>=3)all.Add(new Entry {Id=all.Count,Emoji=fields[0],Words=fields[1],Category=fields[2]});}
    search.SetBounds(24,49,296,22);search.BorderStyle=BorderStyle.None;search.BackColor=Color.FromArgb(53,53,60);search.ForeColor=Color.White;search.Font=smallFont;search.AccessibleName="搜尋表情符號（中文或英文）";
    search.TextChanged+=delegate{Filter();};search.MouseDown+=delegate{SetForegroundWindow(Handle);search.Focus();};Controls.Add(search);
    SendCue(search.Handle,0x1501,new IntPtr(1),"搜尋：貓、開心、愛心…");
    Shown+=delegate{if(Array.IndexOf(Environment.GetCommandLineArgs(),"--hidden")>=0)Hide();};
    focusTimer.Tick+=delegate{IntPtr current=GetForegroundWindow();if(current!=IntPtr.Zero&&current!=Handle)editor=current;};focusTimer.Start();refreshTimer.Tick+=delegate{if(Visible)Invalidate();};refreshTimer.Start();
    MouseMove+=delegate(object sender,MouseEventArgs e){int next=Hit(e.Location);if(next!=hover){hover=next;tips.SetToolTip(this,next>=0?shown[next].Emoji+"  "+shown[next].Words:"");Invalidate();}};
    MouseLeave+=delegate{hover=-1;Invalidate();};MouseWheel+=delegate(object sender,MouseEventArgs e){ChangePage(e.Delta<0?1:-1);};
    MouseDown+=delegate(object sender,MouseEventArgs e){if(e.Button!=MouseButtons.Left)return;
      if(e.Y<38){if(e.X>Width-38)Hide();else{ReleaseCapture();SendMessage(Handle,0xA1,new IntPtr(2),IntPtr.Zero);}return;}
      if(e.Y>=82&&e.Y<138){int col=(e.X-10)/54,row=(e.Y-82)/27,index=row*6+col;if(e.X>=10&&col<6&&index<categories.Length){category=categories[index];Filter();}return;}
      if(e.Y>=Height-40){if(e.X>Width-50)ChangePage(1);else if(e.X>Width-100)ChangePage(-1);return;}
      int item=Hit(e.Location);if(item>=0)Insert(shown[item].Id);
    };Filter();
  }
  void Filter(){shown.Clear();foreach(var entry in all){bool matches=category=="全部"||(category=="常用"?entry.Id<27:entry.Category==category);if(matches&&(search.Text.Length==0||entry.Words.IndexOf(search.Text,StringComparison.OrdinalIgnoreCase)>=0||entry.Emoji.Contains(search.Text)))shown.Add(entry);}page=0;hover=-1;Invalidate();}
  void ChangePage(int amount){int next=Math.Max(0,Math.Min(Math.Max(0,(shown.Count-1)/PageSize),page+amount));if(page!=next){page=next;hover=-1;Invalidate();}}
  protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);hotkeyRegistered=preview||RegisterHotKey(Handle,Hotkey,0x4003,0x45);int corner=2;DwmSetWindowAttribute(Handle,33,ref corner,4);}
  protected override void WndProc(ref Message m){if(m.Msg==0x21){var point=PointToClient(Cursor.Position);m.Result=new IntPtr(point.Y>=42&&point.Y<=76?1:3);return;}if(m.Msg==0x312&&m.WParam.ToInt32()==Hotkey){if(Visible)Hide();else Show();return;}base.WndProc(ref m);}
  int Hit(Point p){int col=(p.X-LeftPad)/Cell,row=(p.Y-TopPad)/Cell;if(p.X<LeftPad||p.Y<TopPad||col>=7||row>=6)return -1;int index=page*PageSize+row*7+col;return index<shown.Count?index:-1;}
  static GraphicsPath Round(Rectangle r,int radius){var p=new GraphicsPath();int d=radius*2;p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
  Image Picture(int id){Image image;if(pictures.TryGetValue(id,out image))return image;string path=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"Emoji",id+".png");if(!File.Exists(path))return null;using(var source=Image.FromFile(path)){var small=new Bitmap(40,40);using(var g=Graphics.FromImage(small)){g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(source,0,0,40,40);}pictures[id]=small;return small;}}
  protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;g.InterpolationMode=InterpolationMode.HighQualityBicubic;
    using(var outline=Round(new Rectangle(0,0,Width-1,Height-1),13))using(var pen=new Pen(Color.FromArgb(80,80,86)))g.DrawPath(pen,outline);
    using(var white=new SolidBrush(Color.FromArgb(240,240,244)))g.DrawString("表情符號",titleFont,white,14,12);
    using(var gray=new SolidBrush(Color.FromArgb(160,160,170))){g.DrawString("×",titleFont,gray,Width-28,9);g.DrawString("‹",titleFont,gray,Width-88,Height-32);g.DrawString("›",titleFont,gray,Width-38,Height-32);g.DrawString(shown.Count+" 個  ·  "+(page+1)+" / "+Math.Max(1,(shown.Count+PageSize-1)/PageSize),smallFont,gray,12,Height-29);}
    using(var path=Round(new Rectangle(12,42,320,34),8))using(var brush=new SolidBrush(Color.FromArgb(53,53,60)))g.FillPath(brush,path);
    if(search.Text.Length==0&&!search.Focused)using(var gray=new SolidBrush(Color.FromArgb(160,160,170)))g.DrawString("搜尋：貓、開心、愛心…",smallFont,gray,24,49);
    for(int i=0;i<categories.Length;i++){var r=new Rectangle(10+i%6*54,82+i/6*27,51,24);bool active=categories[i]==category;if(active)using(var path=Round(r,6))using(var brush=new SolidBrush(Color.FromArgb(72,72,81)))g.FillPath(brush,path);using(var text=new SolidBrush(active?Color.White:Color.FromArgb(180,180,190)))g.DrawString(categories[i],smallFont,text,r.X+11,r.Y+4);}
    for(int n=0;n<PageSize&&page*PageSize+n<shown.Count;n++){int index=page*PageSize+n;Entry entry=shown[index];var r=new Rectangle(LeftPad+n%7*Cell,TopPad+n/7*Cell,43,43);if(index==hover)using(var path=Round(r,8))using(var brush=new SolidBrush(Color.FromArgb(64,64,72)))g.FillPath(brush,path);Image picture=Picture(entry.Id);if(picture!=null)g.DrawImage(picture,r.X+5,r.Y+5,33,33);else g.DrawString(entry.Emoji,emojiFont,Brushes.White,r.X+1,r.Y+1);}
    if(shown.Count==0)g.DrawString("找不到符合的表情符號",smallFont,Brushes.LightGray,88,230);
    if(!hotkeyRegistered)g.DrawString("Ctrl + Alt + E 已被其他程式占用",smallFont,Brushes.Orange,12,Height-48);
  }
  void Insert(int index){if(GetForegroundWindow()==Handle){if(editor==IntPtr.Zero||!IsWindow(editor)||!SetForegroundWindow(editor))return;}var input=new Input[4];for(int i=0;i<4;i++){input[i].type=1;input[i].data.keyboard.key=(ushort)(i<2?131:130);input[i].data.keyboard.scan=(ushort)(i<2?index/128:index%128+1);input[i].data.keyboard.flags=(uint)(i%2==0?0:2);input[i].data.keyboard.extra=new UIntPtr(0x4D434250);}if(SendInput(4,input,Marshal.SizeOf(typeof(Input)))!=4)tips.Show("無法插入：目標程式可能以系統管理員執行。",this,12,Height-48,3500);}
  protected override void Dispose(bool disposing){if(disposing){focusTimer.Dispose();refreshTimer.Dispose();if(hotkeyRegistered&&!preview)UnregisterHotKey(Handle,Hotkey);foreach(var picture in pictures.Values)picture.Dispose();titleFont.Dispose();smallFont.Dispose();emojiFont.Dispose();tips.Dispose();}base.Dispose(disposing);}
  [STAThread]public static void Main(){bool created;using(var mutex=new Mutex(true,Array.IndexOf(Environment.GetCommandLineArgs(),"--preview")>=0?"Local\\BopoMacFoPalettePreview":"Local\\McBopomofoEmojiPalette",out created)){if(!created)return;Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);using(var form=new EmojiBrowser())Application.Run(form);}}
}
