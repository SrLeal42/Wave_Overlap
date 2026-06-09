/**
 * WebGL2 shader sources para o WFC renderer.
 * 
 * Vertex shader: fullscreen quad com UV passthrough.
 * Fragment shader: uber-shader com 4 modos visuais controlados por uMode.
 */

export const VERTEX_SHADER = `#version 300 es
precision highp float;

// Fullscreen quad — 4 vértices, triangle strip
// Posições: (-1,-1), (1,-1), (-1,1), (1,1)
const vec2 positions[4] = vec2[4](
    vec2(-1.0, -1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0,  1.0),
    vec2( 1.0,  1.0)
);

out vec2 vUV;

void main() {
    vec2 pos = positions[gl_VertexID];
    // Converte clip space (-1..1) para UV (0..1), Y invertido para row-major
    vUV = vec2(pos.x * 0.5 + 0.5, 1.0 - (pos.y * 0.5 + 0.5));
    gl_Position = vec4(pos, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

in vec2 vUV;
out vec4 fragColor;

// --- Uniforms ---
uniform usampler2D uMaskTex;      // R8UI texture: bitmask por célula
uniform vec4 uPalette[32];         // Paleta RGBA normalizada (max 32 cores)
uniform int uNumColors;            // Quantas cores na paleta
uniform int uMode;                 // 0=RGB avg, 1=OKLab, 2=Dither, 3=Animated
uniform float uTime;               // Tempo em segundos (para animação)
uniform vec2 uGridSize;            // (cols, rows)

// --- Bayer matrix 4x4 para dithering ---
const int bayer4[16] = int[16](
     0,  8,  2, 10,
    12,  4, 14,  6,
     3, 11,  1,  9,
    15,  7, 13,  5
);

// --- OKLab conversions ---
// Conversão linear (assume sRGB input já linearizado por simplicidade)
vec3 rgbToOklab(vec3 rgb) {
    float l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
    float m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
    float s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;

    float l_ = pow(l, 1.0/3.0);
    float m_ = pow(m, 1.0/3.0);
    float s_ = pow(s, 1.0/3.0);

    return vec3(
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    );
}

vec3 oklabToRgb(vec3 lab) {
    float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
    float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
    float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;

    float l = l_ * l_ * l_;
    float m = m_ * m_ * m_;
    float s = s_ * s_ * s_;

    return clamp(vec3(
         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ), 0.0, 1.0);
}

// --- Decodifica bitmask e coleta cores ---

// Conta bits setados no bitmask
int popcount(uint mask) {
    int count = 0;
    for (int i = 0; i < 32; i++) {
        if (i >= uNumColors) break;
        if ((mask & (1u << uint(i))) != 0u) count++;
    }
    return count;
}

// Retorna a N-ésima cor setada no bitmask
vec3 getNthSetColor(uint mask, int n) {
    int count = 0;
    for (int i = 0; i < 32; i++) {
        if (i >= uNumColors) break;
        if ((mask & (1u << uint(i))) != 0u) {
            if (count == n) return uPalette[i].rgb;
            count++;
        }
    }
    return vec3(0.0);
}

// Retorna o índice da primeira cor setada
int firstSetBit(uint mask) {
    for (int i = 0; i < 32; i++) {
        if ((mask & (1u << uint(i))) != 0u) return i;
    }
    return 0;
}

// --- Modos visuais ---

// Modo 0: Média RGB simples
vec3 modeAvgRGB(uint mask, int count) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 32; i++) {
        if (i >= uNumColors) break;
        if ((mask & (1u << uint(i))) != 0u) {
            sum += uPalette[i].rgb;
        }
    }
    return sum / float(count);
}

// Modo 1: Blend em espaço OKLab
vec3 modeOklab(uint mask, int count) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 32; i++) {
        if (i >= uNumColors) break;
        if ((mask & (1u << uint(i))) != 0u) {
            sum += rgbToOklab(uPalette[i].rgb);
        }
    }
    return oklabToRgb(sum / float(count));
}

// Modo 2: Bayer ordered dithering
vec3 modeDither(uint mask, int count, vec2 pixelPos) {
    ivec2 bp = ivec2(mod(pixelPos, 4.0));
    int threshold = bayer4[bp.y * 4 + bp.x];
    // threshold 0-15 → mapeia para index 0..(count-1)
    int idx = (threshold * count) / 16;
    idx = min(idx, count - 1);
    return getNthSetColor(mask, idx);
}

// Modo 3: Animação — cicla entre as cores possíveis
vec3 modeAnimated(uint mask, int count, vec2 pixelPos) {
    // Onda baseada em posição + tempo
    float phase = uTime * 2.0 + (pixelPos.x + pixelPos.y) * 0.3;
    int idx = int(mod(phase, float(count)));
    idx = clamp(idx, 0, count - 1);
    return getNthSetColor(mask, idx);
}

// --- Main ---

void main() {
    // Coordenada da célula
    ivec2 cell = ivec2(vUV * uGridSize);
    cell = clamp(cell, ivec2(0), ivec2(uGridSize) - 1);

    // Lê o bitmask desta célula
    uint mask = texelFetch(uMaskTex, cell, 0).r;

    int count = popcount(mask);

    if (count == 0) {
        // Contradição ou vazio — fallback escuro
        fragColor = vec4(0.04, 0.04, 0.07, 1.0);
        return;
    }

    if (count == 1) {
        // Colapsada — cor sólida
        int idx = firstSetBit(mask);
        fragColor = vec4(uPalette[idx].rgb, 1.0);
        return;
    }

    // Não colapsada — aplica modo visual
    vec3 color;
    vec2 pixelPos = vUV * uGridSize;

    if (uMode == 0) {
        color = modeAvgRGB(mask, count);
    } else if (uMode == 1) {
        color = modeOklab(mask, count);
    } else if (uMode == 2) {
        color = modeDither(mask, count, pixelPos);
    } else {
        color = modeAnimated(mask, count, pixelPos);
    }

    fragColor = vec4(color, 1.0);
}
`;
