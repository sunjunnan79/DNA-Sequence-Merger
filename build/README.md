# Build Resources

This directory contains resources needed for building the application.

## Icons

Replace the placeholder icon files with actual application icons:

### Windows (icon.ico)
- Format: ICO
- Recommended sizes: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256
- Tools: You can use online converters or tools like ImageMagick

### macOS (icon.icns)
- Format: ICNS
- Recommended sizes: 16x16, 32x32, 64x64, 128x128, 256x256, 512x512, 1024x1024
- Tools: Use `iconutil` on macOS or online converters

### Linux (icon.png)
- Format: PNG
- Recommended size: 512x512 or larger
- Transparent background recommended

## Creating Icons

You can create icons from a single high-resolution PNG (1024x1024) using:

### For macOS:
```bash
mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
```

### For Windows:
Use ImageMagick or online tools to convert PNG to ICO with multiple sizes.

## Entitlements

The `entitlements.mac.plist` file contains macOS security entitlements needed for:
- Network access (for BLAST API)
- File system access (for reading/writing sequence files)
- JIT compilation (for better performance)

Modify these entitlements based on your app's specific needs.
