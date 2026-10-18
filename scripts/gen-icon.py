"""生成应用图标 build/icon.png（纯标准库，无第三方依赖）。
用法: python scripts/gen-icon.py
"""
import os
import struct
import zlib

SIZE = 256
SS = 4  # 超采样倍数，用于抗锯齿
W = SIZE * SS


def new_canvas(w, h, color=(0, 0, 0, 0)):
    return [[list(color) for _ in range(w)] for _ in range(h)]


def blend(px, bg, a):
    return (
        int(px[0] * a + bg[0] * (1 - a)),
        int(px[1] * a + bg[1] * (1 - a)),
        int(px[2] * a + bg[2] * (1 - a)),
        int(px[3] * a + bg[3] * (1 - a)) if bg[3] == 0 else 255,
    )


def rounded_rect(canvas, x0, y0, x1, y1, r, color):
    h = len(canvas)
    w = len(canvas[0])
    x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
    for y in range(max(0, y0), min(h, y1)):
        for x in range(max(0, x0), min(w, x1)):
            # 圆角判定
            cx, cy = None, None
            if x < x0 + r:
                cx = x0 + r
            elif x > x1 - r:
                cx = x1 - r
            if y < y0 + r:
                cy = y0 + r
            elif y > y1 - r:
                cy = y1 - r
            if cx is not None and cy is not None:
                dx, dy = x - cx, y - cy
                if dx * dx + dy * dy > r * r:
                    continue
            canvas[y][x] = list(color)


def circle(canvas, cx, cy, r, color):
    h = len(canvas)
    w = len(canvas[0])
    for y in range(max(0, int(cy - r)), min(h, int(cy + r) + 1)):
        for x in range(max(0, int(cx - r)), min(w, int(cx + r) + 1)):
            dx, dy = x - cx, y - cy
            if dx * dx + dy * dy <= r * r:
                canvas[y][x] = list(color)


def downsample(canvas, factor):
    h = len(canvas) // factor
    w = len(canvas[0]) // factor
    out = []
    for y in range(h):
        row = []
        for x in range(w):
            r = g = b = a = 0
            for dy in range(factor):
                for dx in range(factor):
                    p = canvas[y * factor + dy][x * factor + dx]
                    r += p[0]
                    g += p[1]
                    b += p[2]
                    a += p[3]
            n = factor * factor
            row.append((r // n, g // n, b // n, a // n))
        out.append(row)
    return out


def write_png(path, pixels):
    h = len(pixels)
    w = len(pixels[0])
    raw = b''
    for row in pixels:
        raw += b'\x00' + b''.join(struct.pack('BBBB', *p) for p in row)

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', header)
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(png)


def main():
    c = new_canvas(W, W)
    s = SS
    # 底：深色圆角方块
    rounded_rect(c, 24 * s, 24 * s, 232 * s, 232 * s, 54 * s, (34, 34, 42, 255))
    # 三条“笔记”横线
    rounded_rect(c, 64 * s, 78 * s, 192 * s, 96 * s, 9 * s, (124, 108, 245, 255))
    rounded_rect(c, 64 * s, 118 * s, 168 * s, 134 * s, 8 * s, (154, 146, 232, 255))
    rounded_rect(c, 64 * s, 156 * s, 142 * s, 172 * s, 8 * s, (92, 92, 112, 255))
    # 右下角强调点
    circle(c, 172 * s, 172 * s, 15 * s, (124, 108, 245, 255))

    small = downsample(c, SS)
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'build', 'icon.png')
    write_png(out, small)
    print('written:', out, os.path.getsize(out), 'bytes')


if __name__ == '__main__':
    main()
