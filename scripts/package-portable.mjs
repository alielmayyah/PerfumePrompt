import { cp, mkdir, rm, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

async function main() {
  const isLinux = process.platform === 'linux';
  const isWindows = process.platform === 'win32';

  console.log('1. Building Next.js standalone application...');
  execSync('npm run build', { stdio: 'inherit' });

  const rootDir = process.cwd();
  const folderName = isLinux ? 'PerfumePrompt-linux-x64' : 'PerfumePrompt-Portable';
  const distDir = path.resolve(rootDir, 'dist', folderName);

  console.log(`2. Preparing distribution folder: ${distDir}`);
  if (existsSync(distDir)) {
    await rm(distDir, { recursive: true, force: true });
  }
  await mkdir(distDir, { recursive: true });

  const standaloneDir = path.resolve(rootDir, '.next', 'standalone');
  console.log('3. Copying standalone server files...');
  await cp(standaloneDir, distDir, { recursive: true });

  // Ensure no git metadata, local data, or env files are bundled into the portable release
  const gitInDist = path.resolve(distDir, '.git');
  if (existsSync(gitInDist)) await rm(gitInDist, { recursive: true, force: true });
  const githubInDist = path.resolve(distDir, '.github');
  if (existsSync(githubInDist)) await rm(githubInDist, { recursive: true, force: true });
  const dataInDist = path.resolve(distDir, '.data');
  if (existsSync(dataInDist)) await rm(dataInDist, { recursive: true, force: true });

  console.log('4. Copying static files (.next/static)...');
  const staticSrc = path.resolve(rootDir, '.next', 'static');
  const staticDest = path.resolve(distDir, '.next', 'static');
  await cp(staticSrc, staticDest, { recursive: true });

  const publicSrc = path.resolve(rootDir, 'public');
  if (existsSync(publicSrc)) {
    console.log('5. Copying public assets...');
    const publicDest = path.resolve(distDir, 'public');
    await cp(publicSrc, publicDest, { recursive: true });
  }

  console.log('6. Bundling standalone Node.js binary...');
  const binDir = path.resolve(distDir, 'bin');
  await mkdir(binDir, { recursive: true });

  if (isWindows) {
    const candidateNodes = [
      process.execPath,
      'C:\\Program Files\\nodejs\\node.exe',
    ];
    const nodeExeSrc = candidateNodes.find((p) => p && existsSync(p));
    if (nodeExeSrc) {
      await cp(nodeExeSrc, path.resolve(binDir, 'node.exe'));
      console.log(`   ✓ Bundled node.exe from: ${nodeExeSrc}`);
    } else {
      console.warn('   ⚠️ Warning: node.exe not found at default location.');
    }

    console.log('7. Compiling native Windows launcher (PerfumePrompt.exe)...');
    const launcherSource = path.resolve(rootDir, 'scripts', 'launcher', 'PerfumePrompt.cs');
    const targetExe = path.resolve(distDir, 'PerfumePrompt.exe');
    const standaloneExe = path.resolve(rootDir, 'dist', 'PerfumePrompt.exe');
    const cscPaths = [
      'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
      'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
    ];
    const csc = cscPaths.find(existsSync);
    if (csc && existsSync(launcherSource)) {
      try {
        const compileCmd = `"${csc}" /target:exe /reference:System.IO.Compression.FileSystem.dll /reference:System.IO.Compression.dll /out:"${targetExe}" "${launcherSource}"`;
        execSync(compileCmd, { stdio: 'inherit' });
        await cp(targetExe, standaloneExe);
        console.log('   ✓ Compiled native self-updating PerfumePrompt.exe');
      } catch (err) {
        console.warn('   ⚠️ Failed to compile PerfumePrompt.exe:', err);
      }
    } else {
      console.warn('   ⚠️ csc.exe or launcher source not found, skipping .exe compilation');
    }

    console.log('8. Creating start.bat and README.txt...');
    const startBat = `@echo off
title Perfume Prompt Preparer
echo ========================================================
echo   Perfume Prompt Preparer - Portable Edition
echo ========================================================
echo.
echo Starting local server...
start http://localhost:3000
echo.
echo The app is opening at http://localhost:3000 in your browser!
echo Keep this terminal window open while using the app.
echo.
bin\\node.exe server.js
pause
`;
    await writeFile(path.resolve(distDir, 'start.bat'), startBat, 'utf8');

    const readme = `Perfume Prompt Preparer - Portable Edition
==========================================

HOW TO RUN:
1. Double-click "PerfumePrompt.exe" (or "start.bat")
2. Your browser will automatically open to http://localhost:3000
3. Keep the terminal window open while using the app.

NO INSTALLATION REQUIRED:
- No Node.js installation needed (bundled in bin/node.exe).
- No Git installation needed.
- Runs completely standalone on Windows.

TO STOP:
- Simply close the window.
`;
    await writeFile(path.resolve(distDir, 'README.txt'), readme, 'utf8');

    console.log('9. Creating portable ZIP archive...');
    const zipPath = path.resolve(rootDir, 'dist', 'PerfumePrompt-Portable.zip');
    if (existsSync(zipPath)) {
      await rm(zipPath, { force: true });
    }
    execSync(
      `powershell -Command "Compress-Archive -Path '${distDir}' -DestinationPath '${zipPath}' -Force"`,
      { stdio: 'inherit' },
    );

    console.log('\n======================================================');
    console.log('🎉 Portable Windows package created successfully!');
    console.log(`Folder:  ${distDir}`);
    console.log(`EXE:     ${targetExe}`);
    console.log(`ZIP:     ${zipPath}`);
    console.log('======================================================\n');
  } else if (isLinux) {
    const nodeBinaryDest = path.resolve(binDir, 'node');
    await cp(process.execPath, nodeBinaryDest);
    await chmod(nodeBinaryDest, 0o755);
    console.log(`   ✓ Bundled Linux node binary from: ${process.execPath}`);

    console.log('7. Creating start.sh launcher for Linux...');
    const startShContent = `#!/usr/bin/env bash
DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
echo "========================================================"
echo "  Perfume Prompt Preparer - Linux Edition"
echo "========================================================"
echo ""
echo "Starting local server on http://localhost:3000..."
echo "Keep this terminal window open while using the app."
echo ""

if command -v xdg-open >/dev/null 2>&1; then
    (sleep 2 && xdg-open "http://localhost:3000") >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    (sleep 2 && open "http://localhost:3000") >/dev/null 2>&1 &
fi

exec "\$DIR/bin/node" "\$DIR/server.js"
`;
    const startShPath = path.resolve(distDir, 'start.sh');
    await writeFile(startShPath, startShContent, 'utf8');
    await chmod(startShPath, 0o755);

    const readmeLinux = `Perfume Prompt Preparer - Linux Edition
=======================================

HOW TO RUN:
1. Open a terminal in this directory
2. Run: ./start.sh
3. Your browser will open automatically to http://localhost:3000

NO INSTALLATION REQUIRED:
- Bundled with standalone Node.js runtime (bin/node).
- No dependencies to install.
- Runs offline and locally.

TO STOP:
- Press Ctrl+C in the terminal.
`;
    await writeFile(path.resolve(distDir, 'README.txt'), readmeLinux, 'utf8');

    console.log('8. Creating Linux tar.gz archive...');
    const tarGzPath = path.resolve(rootDir, 'dist', 'PerfumePrompt-linux-x64.tar.gz');
    if (existsSync(tarGzPath)) {
      await rm(tarGzPath, { force: true });
    }
    execSync(`tar -czf "${tarGzPath}" -C "${path.resolve(rootDir, 'dist')}" "${folderName}"`, {
      stdio: 'inherit',
    });

    console.log('\n======================================================');
    console.log('🎉 Portable Linux package created successfully!');
    console.log(`Folder:  ${distDir}`);
    console.log(`Archive: ${tarGzPath}`);
    console.log('======================================================\n');
  }
}

main().catch((err) => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
