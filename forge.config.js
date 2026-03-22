// Electron Forge configuration
// Builds installers for Windows (.exe), macOS (.dmg), and Linux (.deb / .AppImage)
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'PageMosaic',
    executableName: 'pagemosaic',
    // Files to exclude from the packaged app
    ignore: [
      /^\/\.git/,
      /^\/\.github/,
      /^\/node_modules\/.cache/,
      // Exclude user data directories from the bundle
      // (users point to their own projects/releases folders)
      /^\/projects/,
      /^\/releases/,
    ],
    appBundleId: 'com.pagemosaic.app',
    appCategoryType: 'public.app-category.developer-tools',
    // macOS code signing (set env vars CI_SIGNING_IDENTITY etc. in CI)
    // osxSign: {},
    // osxNotarize: { tool: 'notarytool', ... },
  },

  rebuildConfig: {},

  makers: [
    // Windows: Squirrel installer (.exe)
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'PageMosaic',
      },
    },
    // macOS: DMG disk image
    {
      name: '@electron-forge/maker-dmg',
      config: {
        name: 'PageMosaic',
        format: 'ULFO',
      },
    },
    // Linux: .deb package
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'PageMosaic',
          homepage: 'https://github.com/yukishima9/webbuilder',
        },
      },
    },
    // Linux: RPM package
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          homepage: 'https://github.com/yukishima9/webbuilder',
        },
      },
    },
    // Cross-platform: plain .zip (useful for direct downloads)
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
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