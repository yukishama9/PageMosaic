// Electron Forge configuration
// Builds installers for Windows (.exe), macOS (.dmg), and Linux (.deb / .rpm)
const path = require('path');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'PageMosaic',
    executableName: 'pagemosaic',
    icon: path.join(__dirname, 'resources/icon'),
    // Files to exclude from the packaged app
    ignore: [
      /^\/\.git/,
      /^\/\.github/,
      /^\/node_modules\/.cache/,
      /^\/projects/,
      /^\/releases/,
    ],
    appBundleId: 'com.pagemosaic.app',
    appCategoryType: 'public.app-category.developer-tools',
  },

  rebuildConfig: {},

  makers: [
    // Windows: Squirrel installer (.exe) — Windows only
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'PageMosaic',
      },
    },
    // macOS: DMG disk image — macOS only
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        name: 'PageMosaic',
        format: 'ULFO',
      },
    },
    // Linux: .deb package — Linux only
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        options: {
          maintainer: 'PageMosaic',
          homepage: 'https://github.com/yukishama9/PageMosaic',
        },
      },
    },
    // Linux: RPM package — Linux only
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
      config: {
        options: {
          homepage: 'https://github.com/yukishama9/PageMosaic',
        },
      },
    },
    // Cross-platform: plain .zip for all platforms
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32', 'darwin', 'linux'],
    },
  ],

  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Electron Fuses — harden the binary
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};