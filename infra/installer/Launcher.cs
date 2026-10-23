using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using System.Windows.Forms;
internal static class Launcher {
  private static void Validate(string directory) {
    string root=Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
    if((File.GetAttributes(directory)&FileAttributes.ReparsePoint)!=0) throw new Exception("Pacote nao pode ser link/junction.");
    var serializer=new JavaScriptSerializer();
    var manifest=serializer.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(root,"manifest.json")));
    if(Convert.ToInt32(manifest["schemaVersion"])!=1) throw new Exception("Manifesto invalido.");
    var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    foreach(var item in (System.Collections.IEnumerable)manifest["files"]) {
      var entry=(Dictionary<string,object>)item;
      string relative=Convert.ToString(entry["path"]);
      if(Path.IsPathRooted(relative)||relative.Contains(":"))throw new Exception("Caminho invalido.");
      foreach(string part in relative.Split(new[]{'/',(char)92}))if(part==".."||part==".")throw new Exception("Caminho invalido.");
      string file=Path.GetFullPath(Path.Combine(root,relative));
      if(!file.StartsWith(root,StringComparison.OrdinalIgnoreCase)||!seen.Add(relative))throw new Exception("Arquivo fora do pacote/duplicado.");
      string cursor=file;
      while(cursor.Length>=root.Length) {
        if((File.GetAttributes(cursor)&FileAttributes.ReparsePoint)!=0)throw new Exception("Link/junction no pacote.");
        cursor=Path.GetDirectoryName(cursor);
      }
      using(var sha=SHA256.Create())using(var stream=File.OpenRead(file)) {
        string actual=BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();
        if(actual!=Convert.ToString(entry["sha256"]))throw new Exception("Arquivo adulterado: "+relative);
      }
    }
    foreach(string name in new[]{"Instalar-POS.exe","Instalar-POS.ps1","Pos.Common.ps1","Pos.Install.ps1"})if(!seen.Contains(name))throw new Exception("Arquivo obrigatorio ausente: "+name);
  }
  [STAThread] private static int Main(string[] args) {
    string option="";
    if(args.Length>1)return 2;
    if(args.Length==1)switch(args[0]) {
      case "--validate": option=" -ValidateOnly";break;
      case "--principal": option=" -Mode Principal";break;
      case "--terminal": option=" -Mode Terminal";break;
      default:return 2;
    }
    string directory=AppDomain.CurrentDomain.BaseDirectory;
    try{Validate(directory);}catch(Exception error){if(option!=" -ValidateOnly")MessageBox.Show(error.Message,"POS - pacote recusado");return 3;}
    string script=Path.Combine(directory,"Instalar-POS.ps1");
    string shell=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell","v1.0","powershell.exe");
    var info=new ProcessStartInfo(shell);
    info.Arguments="-NoProfile -STA -ExecutionPolicy Bypass -File "+(char)34+script+(char)34+option;
    info.UseShellExecute=false;info.CreateNoWindow=true;
    using(var child=Process.Start(info)){child.WaitForExit();return child.ExitCode;}
  }
}
