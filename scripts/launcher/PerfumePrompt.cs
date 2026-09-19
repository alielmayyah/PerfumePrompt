using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace PerfumePrompt
{
    class Program
    {
        static Process nodeProcess;

        static void Main(string[] args)
        {
            Console.Title = "Perfume Prompt Preparer";
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("========================================================");
            Console.WriteLine("  Perfume Prompt Preparer - Portable Edition");
            Console.WriteLine("========================================================");
            Console.ResetColor();
            Console.WriteLine();

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string nodePath = Path.Combine(baseDir, "bin", "node.exe");
            string serverPath = Path.Combine(baseDir, "server.js");

            if (!File.Exists(nodePath))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Error: bin\\node.exe not found.");
                Console.ResetColor();
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
                return;
            }

            if (!File.Exists(serverPath))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Error: server.js not found.");
                Console.ResetColor();
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
                return;
            }

            Console.WriteLine("Starting local server on http://localhost:3000...");

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = nodePath;
            psi.Arguments = "\"" + serverPath + "\"";
            psi.WorkingDirectory = baseDir;
            psi.UseShellExecute = false;
            psi.EnvironmentVariables["PORT"] = "3000";
            psi.EnvironmentVariables["NODE_ENV"] = "production";

            try
            {
                nodeProcess = Process.Start(psi);
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Failed to launch node: " + ex.Message);
                Console.ResetColor();
                Console.ReadKey();
                return;
            }

            AppDomain.CurrentDomain.ProcessExit += OnProcessExit;
            Console.CancelKeyPress += OnCancelKeyPress;

            // Open browser after a brief startup delay
            new Thread(() =>
            {
                Thread.Sleep(1200);
                try
                {
                    Process.Start(new ProcessStartInfo("http://localhost:3000") { UseShellExecute = true });
                }
                catch { }
            }).Start();

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("✓ Server is running!");
            Console.ResetColor();
            Console.WriteLine();
            Console.WriteLine("Opening http://localhost:3000 in your browser...");
            Console.WriteLine("(Keep this window open while using the app. Close to exit.)");
            Console.WriteLine();

            nodeProcess.WaitForExit();
        }

        static void OnProcessExit(object sender, EventArgs e)
        {
            KillNode();
        }

        static void OnCancelKeyPress(object sender, ConsoleCancelEventArgs e)
        {
            KillNode();
        }

        static void KillNode()
        {
            try
            {
                if (nodeProcess != null && !nodeProcess.HasExited)
                {
                    nodeProcess.Kill();
                }
            }
            catch { }
        }
    }
}
