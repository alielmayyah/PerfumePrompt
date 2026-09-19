using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading;

namespace PerfumePrompt
{
    class Program
    {
        const string GITHUB_REPO = "alielmayyah/PerfumePrompt";
        static Process nodeProcess;

        static void Main(string[] args)
        {
            Console.Title = "Perfume Prompt Preparer";
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("========================================================");
            Console.WriteLine("        Perfume Prompt Preparer - Desktop Launcher      ");
            Console.WriteLine("========================================================");
            Console.ResetColor();
            Console.WriteLine();

            // Force TLS 1.2 for modern GitHub HTTPS connections
            try
            {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // Tls12
            }
            catch { }

            string appDir = ResolveAppDirectory();
            CheckAndUpdateApp(appDir);
            LaunchApp(appDir);
        }

        static string ResolveAppDirectory()
        {
            string currentDir = AppDomain.CurrentDomain.BaseDirectory;
            // If running inside an existing unpacked installation directory
            if (File.Exists(Path.Combine(currentDir, "server.js")) &&
                File.Exists(Path.Combine(currentDir, "bin", "node.exe")))
            {
                return currentDir;
            }

            // Otherwise, store and maintain the app in %LOCALAPPDATA%\PerfumePrompt\runtime
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string appDataDir = Path.Combine(localAppData, "PerfumePrompt", "runtime");
            if (!Directory.Exists(appDataDir))
            {
                Directory.CreateDirectory(appDataDir);
            }
            return appDataDir;
        }

        static void CheckAndUpdateApp(string appDir)
        {
            string versionFile = Path.Combine(appDir, "installed_version.txt");
            string currentVersion = File.Exists(versionFile) ? File.ReadAllText(versionFile).Trim() : "";

            bool serverMissing = !File.Exists(Path.Combine(appDir, "server.js")) ||
                                 !File.Exists(Path.Combine(appDir, "bin", "node.exe"));

            Console.ForegroundColor = ConsoleColor.DarkYellow;
            Console.Write("Checking for updates on GitHub... ");
            Console.ResetColor();

            string latestTag = null;
            string downloadUrl = null;

            try
            {
                using (var client = new WebClient())
                {
                    client.Headers["User-Agent"] = "PerfumePrompt-SelfUpdatingLauncher/1.0";
                    client.Headers["Accept"] = "application/vnd.github.v3+json";

                    string apiUrl = "https://api.github.com/repos/" + GITHUB_REPO + "/releases/latest";
                    string json = client.DownloadString(apiUrl);

                    // Extract tag_name
                    var tagMatch = Regex.Match(json, "\"tag_name\"\\s*:\\s*\"([^\"]+)\"");
                    if (tagMatch.Success)
                    {
                        latestTag = tagMatch.Groups[1].Value;
                    }

                    // Extract target_commitish (commit SHA) or published_at for rolling releases
                    string releaseFingerprint = latestTag ?? "";
                    var commitMatch = Regex.Match(json, "\"target_commitish\"\\s*:\\s*\"([^\"]+)\"");
                    var dateMatch = Regex.Match(json, "\"published_at\"\\s*:\\s*\"([^\"]+)\"");
                    if (commitMatch.Success)
                    {
                        releaseFingerprint += "-" + commitMatch.Groups[1].Value;
                    }
                    else if (dateMatch.Success)
                    {
                        releaseFingerprint += "-" + dateMatch.Groups[1].Value;
                    }

                    // Extract browser_download_url for PerfumePrompt-Portable.zip
                    var urlMatch = Regex.Match(json, "\"browser_download_url\"\\s*:\\s*\"([^\"]+PerfumePrompt-Portable\\.zip)\"");
                    if (urlMatch.Success)
                    {
                        downloadUrl = urlMatch.Groups[1].Value;
                    }

                    if (!string.IsNullOrEmpty(downloadUrl))
                    {
                        bool isNewer = string.IsNullOrEmpty(currentVersion) || !string.Equals(currentVersion, releaseFingerprint, StringComparison.OrdinalIgnoreCase);

                        if (isNewer || serverMissing)
                        {
                            Console.ForegroundColor = ConsoleColor.Green;
                            Console.WriteLine("Update found (" + latestTag + ")!");
                            Console.ResetColor();

                            DownloadAndExtractUpdate(downloadUrl, appDir);
                            try
                            {
                                File.WriteAllText(versionFile, releaseFingerprint);
                            }
                            catch { }
                            return;
                        }
                        else
                        {
                            Console.ForegroundColor = ConsoleColor.Green;
                            Console.WriteLine("Up to date (" + (latestTag ?? "latest") + ").");
                            Console.ResetColor();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("offline or skipped (" + ex.Message + ").");
            }

            if (serverMissing)
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("\nFirst-time setup: Could not fetch initial release from GitHub.");
                Console.WriteLine("Please ensure you have an active internet connection.\n");
                Console.ResetColor();
            }
            else
            {
                Console.WriteLine("Continuing with installed version.");
            }
        }

        static void DownloadAndExtractUpdate(string downloadUrl, string targetDir)
        {
            string tempZip = Path.Combine(Path.GetTempPath(), "PerfumePrompt-update-" + Guid.NewGuid().ToString("N") + ".zip");

            try
            {
                Console.WriteLine("Downloading latest release package...");
                using (var client = new WebClient())
                {
                    client.Headers["User-Agent"] = "PerfumePrompt-SelfUpdatingLauncher/1.0";

                    long lastPrintedPercent = -1;
                    client.DownloadProgressChanged += (s, e) =>
                    {
                        if (e.ProgressPercentage != lastPrintedPercent)
                        {
                            lastPrintedPercent = e.ProgressPercentage;
                            DrawProgressBar(e.ProgressPercentage, e.BytesReceived, e.TotalBytesToReceive);
                        }
                    };

                    var downloadDone = new ManualResetEvent(false);
                    client.DownloadFileCompleted += (s, e) =>
                    {
                        downloadDone.Set();
                    };

                    client.DownloadFileAsync(new Uri(downloadUrl), tempZip);
                    downloadDone.WaitOne();
                }

                Console.WriteLine("\nApplying update to: " + targetDir);

                using (var archive = ZipFile.OpenRead(tempZip))
                {
                    foreach (var entry in archive.Entries)
                    {
                        // Clean root folder prefix if archive contains a top-level PerfumePrompt-Portable/ folder
                        string relPath = entry.FullName;
                        if (relPath.StartsWith("PerfumePrompt-Portable/", StringComparison.OrdinalIgnoreCase) ||
                            relPath.StartsWith("PerfumePrompt-Portable\\", StringComparison.OrdinalIgnoreCase))
                        {
                            relPath = relPath.Substring("PerfumePrompt-Portable/".Length);
                        }

                        if (string.IsNullOrEmpty(relPath)) continue;

                        // Never overwrite user's saved perfumes or local data
                        if (relPath.StartsWith(".data/", StringComparison.OrdinalIgnoreCase) ||
                            relPath.StartsWith(".data\\", StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        string destPath = Path.Combine(targetDir, relPath);
                        string destDir = Path.GetDirectoryName(destPath);
                        if (!string.IsNullOrEmpty(destDir) && !Directory.Exists(destDir))
                        {
                            Directory.CreateDirectory(destDir);
                        }

                        if (!string.IsNullOrEmpty(entry.Name))
                        {
                            entry.ExtractToFile(destPath, true);
                        }
                    }
                }

                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("✓ Update installed successfully!\n");
                Console.ResetColor();
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("\nUpdate failed: " + ex.Message);
                Console.ResetColor();
            }
            finally
            {
                if (File.Exists(tempZip))
                {
                    try { File.Delete(tempZip); } catch { }
                }
            }
        }

        static void DrawProgressBar(int percent, long received, long total)
        {
            int barWidth = 30;
            int filled = (percent * barWidth) / 100;
            string bar = new string('=', filled) + (filled < barWidth ? ">" : "") + new string(' ', Math.Max(0, barWidth - filled - (filled < barWidth ? 1 : 0)));

            string mbInfo = total > 0
                ? string.Format(" {0:0.0} MB / {1:0.0} MB", received / 1048576.0, total / 1048576.0)
                : "";

            Console.Write("\r  Progress: [" + bar + "] " + percent + "%" + mbInfo + "   ");
        }

        static void LaunchApp(string appDir)
        {
            string nodePath = Path.Combine(appDir, "bin", "node.exe");
            string serverPath = Path.Combine(appDir, "server.js");

            if (!File.Exists(nodePath) || !File.Exists(serverPath))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Error: Application files not found in " + appDir);
                Console.ResetColor();
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
                return;
            }

            Console.WriteLine("Starting Perfume Prompt Preparer on http://localhost:3000...");

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = nodePath;
            psi.Arguments = "\"" + serverPath + "\"";
            psi.WorkingDirectory = appDir;
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
                Console.WriteLine("Failed to launch node process: " + ex.Message);
                Console.ResetColor();
                Console.ReadKey();
                return;
            }

            AppDomain.CurrentDomain.ProcessExit += (s, e) => KillNode();
            Console.CancelKeyPress += (s, e) => KillNode();

            // Open browser after server has started
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
