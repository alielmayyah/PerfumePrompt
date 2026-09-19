import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

async function main() {
  console.log('1. Building Next.js standalone application...');
  execSync('npm run build', { stdio: 'inherit' });

  const rootDir = process.cwd();
  const distDir = path.resolve(rootDir, 'dist', 'PerfumePrompt-Portable');

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

  const nodeExeSrc = 'C:\\Program Files\\nodejs\\node.exe';
  if (existsSync(nodeExeSrc)) {
    await cp(nodeExeSrc, path.resolve(binDir, 'node.exe'));
    console.log('   ✓ Bundled node.exe');
  } else {
    console.warn('   ⚠️ Warning: node.exe not found at default location.');
  }

  console.log('7. Compiling native Windows launcher (PerfumePrompt.exe)...');
  const launcherSource = path.resolve(rootDir, 'scripts', 'launcher', 'PerfumePrompt.cs');
  const targetExe = path.resolve(distDir, 'PerfumePrompt.exe');
  const cscPaths = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
  ];
  const csc = cscPaths.find(existsSync);
  if (csc && existsSync(launcherSource)) {
    try {
      execSync(`"${csc}" /target:exe /out:"${targetExe}" "${launcherSource}"`, { stdio: 'ignore' });
      console.log('   ✓ Compiled native PerfumePrompt.exe');
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
  console.log('🎉 Portable package created successfully!');
  console.log(`Folder:  ${distDir}`);
  console.log(`EXE:     ${targetExe}`);
  console.log(`ZIP:     ${zipPath}`);
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
