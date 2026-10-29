using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Security.Principal;
using System.Windows.Forms;
[assembly:System.Reflection.AssemblyTitle("bopo MAC fo Setup")]
[assembly:System.Reflection.AssemblyVersion("0.1.0.0")]
public sealed class Setup : Form {
 readonly RadioButton keep=new RadioButton(),exclusive=new RadioButton();
 readonly Button install=new Button(),cancel=new Button();readonly Label status=new Label();
 readonly string root=AppDomain.CurrentDomain.BaseDirectory;bool busy;
 public Setup(){
  Text="ㄅㄆMac ㄈ · 安裝";ClientSize=new Size(580,420);StartPosition=FormStartPosition.CenterScreen;FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;
  BackColor=Color.FromArgb(36,36,40);ForeColor=Color.FromArgb(238,238,242);Font=new Font("Microsoft JhengHei UI",10);
  var title=new Label {Text="ㄅㄆMac ㄈ",Font=new Font("Microsoft JhengHei UI",25,FontStyle.Bold),Location=new Point(28,25),AutoSize=true};Controls.Add(title);
  var subtitle=new Label {Text="把 Mac 的注音輸入邏輯，帶到 Windows。",Location=new Point(30,85),AutoSize=true};Controls.Add(subtitle);
  var features=new Label {Text="暗色候選框  ·  CapsLock 中英切換  ·  3,944 個 emoji",Location=new Point(30,121),AutoSize=true,ForeColor=Color.FromArgb(176,176,188)};Controls.Add(features);
  keep.Text="保留其他輸入法，將 bopo MAC fo 設為預設";keep.Checked=true;keep.SetBounds(30,177,520,28);Controls.Add(keep);
  exclusive.Text="只使用 bopo MAC fo，停用其他輸入法";exclusive.SetBounds(30,211,520,28);Controls.Add(exclusive);
  var note=new Label {Text="會先備份原設定，再安裝 PIME 元件與登入啟動程式。\n首次安裝需要網路與 Windows 管理員確認。",Location=new Point(32,257),Size=new Size(515,49),ForeColor=Color.FromArgb(176,176,188)};Controls.Add(note);
  status.SetBounds(32,322,520,30);status.Text="Windows 10／11 x64 · 預覽版 0.1.0";Controls.Add(status);
  cancel.Text="取消";cancel.SetBounds(331,366,100,34);cancel.FlatStyle=FlatStyle.Flat;cancel.Click+=delegate{Close();};Controls.Add(cancel);
  install.Text="安裝";install.SetBounds(443,366,105,34);install.FlatStyle=FlatStyle.Flat;install.BackColor=Color.FromArgb(0,102,226);install.FlatAppearance.BorderSize=0;install.Click+=Install;Controls.Add(install);
  FormClosing+=delegate(object sender,FormClosingEventArgs e){if(busy)e.Cancel=true;};
 }
 async void Install(object sender,EventArgs args){
  if(!Environment.Is64BitOperatingSystem){MessageBox.Show(this,"此預覽版需要 Windows x64。","無法安裝");return;}
  if(!File.Exists(Path.Combine(root,"manifest.json"))){MessageBox.Show(this,"請先完整解壓縮安裝包，再執行 Setup.exe。","找不到安裝檔案");return;}
  busy=true;install.Enabled=false;cancel.Enabled=false;keep.Enabled=false;exclusive.Enabled=false;status.Text="正在安裝，請留意 Windows 管理員提示…";
  try {
   var start=new ProcessStartInfo {FileName=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),"System32","WindowsPowerShell","v1.0","powershell.exe"),Arguments="-NoProfile -ExecutionPolicy Bypass -File \""+Path.Combine(root,"installer","Install.ps1")+"\" -UserSid \""+WindowsIdentity.GetCurrent().User.Value+"\""+(exclusive.Checked?" -Exclusive":""),UseShellExecute=true,Verb="runas",WindowStyle=ProcessWindowStyle.Hidden};
   var process=Process.Start(start);await System.Threading.Tasks.Task.Run(()=>process.WaitForExit());
   if(process.ExitCode!=0)throw new Exception("安裝未完成，已嘗試回復原設定。請查看教學或回報問題。");
   string pime=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),"PIME");
   Process.Start(new ProcessStartInfo(Path.Combine(pime,"PIMELauncher.exe")){WindowStyle=ProcessWindowStyle.Hidden});
   string tools=Path.Combine(pime,"bopo-mac-fo");
   Process.Start(new ProcessStartInfo(Path.Combine(tools,"CapsSwitch.exe")){WindowStyle=ProcessWindowStyle.Hidden});
   Process.Start(new ProcessStartInfo(Path.Combine(tools,"EmojiPalette.exe"),"--hidden"){WindowStyle=ProcessWindowStyle.Hidden});
   Process.Start(new ProcessStartInfo(start.FileName,"-NoProfile -ExecutionPolicy Bypass -File \""+Path.Combine(tools,"Activate.ps1")+"\""){UseShellExecute=false,CreateNoWindow=true});
   status.Text="安裝完成！請重新開啟要輸入文字的應用程式。";install.Text="完成";install.Click-=Install;install.Click+=delegate{Close();};
  }catch(System.ComponentModel.Win32Exception e){status.Text=e.NativeErrorCode==1223?"已取消管理員確認，尚未安裝。":e.Message;}
  catch(Exception e){status.Text="安裝未完成";MessageBox.Show(this,e.Message,"bopo MAC fo",MessageBoxButtons.OK,MessageBoxIcon.Information);}
  finally{busy=false;install.Enabled=true;cancel.Enabled=true;keep.Enabled=true;exclusive.Enabled=true;}
 }
 [STAThread]public static void Main(){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new Setup());}
}
