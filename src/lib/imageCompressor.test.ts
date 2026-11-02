import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  compressImage,
  compressFotoEntregaMotorista,
  dataUrlToBlob,
  formatBytes,
} from './imageCompressor'

describe('imageCompressor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('formata bytes corretamente', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(150 * 1024)).toBe('150 KB')
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5 MB')
  })

  it('converte dataUrl para Blob adequadamente', () => {
    // 1x1 pixel gif base64
    const dataUrl =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
    const blob = dataUrlToBlob(dataUrl)
    expect(blob).not.toBeNull()
    expect(blob?.type).toBe('image/jpeg')
    expect(blob?.size).toBeGreaterThan(0)
  })

  it('dataUrlToBlob retorna null para strings inválidas', () => {
    expect(dataUrlToBlob('invalid')).toBeNull()
  })

  it('pula recompressão se imagem já for JPEG pequena em dimensões e tamanho', async () => {
    // Simula um arquivo JPEG pequeno de 50KB e dimensões 800x600
    const fakeBlob = new Blob(['fake-jpeg-data'], { type: 'image/jpeg' })
    Object.defineProperty(fakeBlob, 'size', { value: 50 * 1024 })

    // Mock do FileReader
    const fakeDataUrl = 'data:image/jpeg;base64,12345'
    vi.spyOn(window, 'FileReader').mockImplementation(function () {
      return {
        readAsDataURL: vi.fn(function (this: any) {
          setTimeout(() => {
            this.result = fakeDataUrl
            this.onload?.()
          }, 0)
        }),
      } as any
    })

    // Mock do Image
    vi.spyOn(window, 'Image').mockImplementation(function () {
      const img = {
        naturalWidth: 800,
        naturalHeight: 600,
        width: 800,
        height: 600,
        onload: null as any,
        onerror: null as any,
        set src(_val: string) {
          setTimeout(() => this.onload?.(), 0)
        },
      }
      return img as any
    })

    const result = await compressFotoEntregaMotorista(fakeBlob)
    expect(result.wasCompressed).toBe(false)
    expect(result.width).toBe(800)
    expect(result.height).toBe(600)
    expect(result.dataUrl).toBe(fakeDataUrl)
  })

  it('redimensiona e comprime quando imagem excede a resolução máxima (ex: 4000x3000)', async () => {
    const fakeBlob = new Blob(['large-image'], { type: 'image/jpeg' })
    Object.defineProperty(fakeBlob, 'size', { value: 5 * 1024 * 1024 }) // 5MB

    const fakeDataUrl = 'data:image/jpeg;base64,large'
    vi.spyOn(window, 'FileReader').mockImplementation(function () {
      return {
        readAsDataURL: vi.fn(function (this: any) {
          setTimeout(() => {
            this.result = fakeDataUrl
            this.onload?.()
          }, 0)
        }),
      } as any
    })

    vi.spyOn(window, 'Image').mockImplementation(function () {
      const img = {
        naturalWidth: 4000,
        naturalHeight: 3000,
        width: 4000,
        height: 3000,
        onload: null as any,
        onerror: null as any,
        set src(_val: string) {
          setTimeout(() => this.onload?.(), 0)
        },
      }
      return img as any
    })

    // Mock do Canvas
    const mockDrawImage = vi.fn()
    const mockFillRect = vi.fn()
    const mockToDataURL = vi.fn(() => 'data:image/jpeg;base64,compressed')
    const mockToBlob = vi.fn((cb: (b: Blob) => void) => {
      const b = new Blob(['compressed-bytes'], { type: 'image/jpeg' })
      cb(b)
    })

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({
            fillStyle: '',
            fillRect: mockFillRect,
            drawImage: mockDrawImage,
          })),
          toDataURL: mockToDataURL,
          toBlob: mockToBlob,
        } as any
      }
      return document.createElement(tagName)
    })

    const result = await compressFotoEntregaMotorista(fakeBlob)
    expect(result.wasCompressed).toBe(true)
    // 4000x3000 escalado para max 1280 => ratio 1280/4000 = 0.32 => 1280x960
    expect(result.width).toBe(1280)
    expect(result.height).toBe(960)
    expect(result.dataUrl).toBe('data:image/jpeg;base64,compressed')
  })
})
