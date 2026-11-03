// Renders build/icon.svg into the PNGs used by Electron, electron-builder and Capacitor.
import sharp from 'sharp'

const svg = 'build/icon.svg'
await sharp(svg).resize(1024, 1024).png().toFile('build/icon.png')
await sharp(svg).resize(256, 256).png().toFile('public/icon.png')
await sharp(svg).resize(1024, 1024).png().toFile('assets/icon-only.png')
await sharp(svg).resize(1024, 1024).png().toFile('assets/icon-foreground.png')
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#0b0d12' } }).png().toFile('assets/icon-background.png')
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#0b0d12' } })
  .composite([{ input: await sharp(svg).resize(512, 512).png().toBuffer(), gravity: 'center' }])
  .png()
  .toFile('assets/splash.png')
console.log('icons ok')
