import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const localChromePaths = [
  process.env.CHROME_EXECUTABLE_PATH,
  process.env.LOCALAPPDATA &&
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env.PROGRAMFILES &&
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env['PROGRAMFILES(X86)'] &&
    `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
].filter((path): path is string => Boolean(path))

async function getBrowserOptions() {
  if (process.platform === 'win32') {
    const { access } = await import('node:fs/promises')
    for (const executablePath of localChromePaths) {
      try {
        await access(executablePath)
        return { executablePath, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
      } catch {
        // Try the next standard Chrome location.
      }
    }
    throw new Error('Chrome tidak ditemukan. Atur CHROME_EXECUTABLE_PATH untuk membuat PDF lokal.')
  }

  return {
    executablePath: await chromium.executablePath(),
    args: chromium.args,
  }
}

export async function renderAkadPdf(html: string) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'venturego-akad-chrome-'))
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined

  try {
    browser = await puppeteer.launch({
      ...(await getBrowserOptions()),
      headless: true,
      userDataDir,
    })
    const page = await browser.newPage()
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 })
    await page.waitForFunction(() => document.querySelectorAll('.a4-page').length > 0, {
      timeout: 20_000,
    })
    await page.evaluate(async () => {
      await Promise.race([
        document.fonts?.ready ?? Promise.resolve(),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ])
      await Promise.all(
        Array.from(document.images, (image) => image.decode().catch(() => undefined)),
      )
    })
    await page.emulateMediaType('print')

    return await page.pdf({
      format: 'A4',
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground: true,
      preferCSSPageSize: true,
      timeout: 30_000,
    })
  } finally {
    await browser?.close().catch(() => undefined)
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
