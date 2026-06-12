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



// ==========================================
// Bloom Post-Processing Shaders
// ==========================================

/**
 * Bright Extract — extrai pixels acima do threshold de luminância.
 * Usa pesos Rec.709 para cálculo de luminância.
 */
export const BLOOM_BRIGHT_SHADER = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform float uThreshold;

void main() {
    vec3 color = texture(uSceneTex, vUV).rgb;
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));

    // Soft knee: transição suave ao redor do threshold
    float contrib = max(0.0, luma - uThreshold);
    contrib = contrib / (contrib + 0.001); // normaliza para 0..~1

    fragColor = vec4(color * contrib, 1.0);
}
`;

/**
 * Gaussian Blur separável 9-tap.
 * Usa uniform uDirection para alternar entre passe horizontal e vertical.
 */
export const BLOOM_BLUR_SHADER = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uInputTex;
uniform vec2 uDirection; // (1/width, 0) para H, (0, 1/height) para V

// 9-tap Gaussian weights (sigma ≈ 2.5)
const float weights[5] = float[5](
    0.2270270270,
    0.1945945946,
    0.1216216216,
    0.0540540541,
    0.0162162162
);

void main() {
    vec3 result = texture(uInputTex, vUV).rgb * weights[0];

    for (int i = 1; i < 5; i++) {
        vec2 offset = uDirection * float(i);
        result += texture(uInputTex, vUV + offset).rgb * weights[i];
        result += texture(uInputTex, vUV - offset).rgb * weights[i];
    }

    fragColor = vec4(result, 1.0);
}
`;

/**
 * Composite — combina a cena original com o bloom (additive).
 */
export const BLOOM_COMPOSITE_SHADER = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uBloomTex;
uniform float uIntensity;

void main() {
    vec3 scene = texture(uSceneTex, vUV).rgb;
    vec3 bloom = texture(uBloomTex, vUV).rgb;
    fragColor = vec4(scene + bloom * uIntensity, 1.0);
}
`;

/**
 * Vertex shader para passes de post-processing (sem inversão de Y).
 * Usado pelo bloom — os FBOs já estão na orientação correta.
 */
export const POST_VERTEX_SHADER = `#version 300 es

precision highp float;
const vec2 positions[4] = vec2[4](
    vec2(-1.0, -1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0,  1.0),
    vec2( 1.0,  1.0)
);

out vec2 vUV;
void main() {
    vec2 pos = positions[gl_VertexID];
    // Sem inversão de Y — FBOs já estão orientados corretamente
    vUV = vec2(pos.x * 0.5 + 0.5, pos.y * 0.5 + 0.5);
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

float interleavedGradientNoise(vec2 pos) {
    vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
    return fract(magic.z * fract(dot(pos, magic.xy)));
}
// Modo 2 - Dithering
vec3 modeDither(uint mask, int count, vec2 pixelPos) {
    float noise = interleavedGradientNoise(pixelPos);
    
    // Posição contínua ao longo das cores
    float pos = noise * float(count - 1);
    int idx0 = int(floor(pos));
    int idx1 = min(idx0 + 1, count - 1);
    float t = fract(pos);
    
    vec3 c0 = getNthSetColor(mask, idx0);
    vec3 c1 = getNthSetColor(mask, idx1);
    
    // Blend em OKLab para transição perceptualmente uniforme
    vec3 lab0 = rgbToOklab(c0);
    vec3 lab1 = rgbToOklab(c1);

    return oklabToRgb(mix(lab0, lab1, t));
}

// Modo 3: Animação — cicla suavemente entre as cores possíveis
vec3 modeAnimated(uint mask, int count, vec2 pixelPos) {
    
    // Onda baseada em posição + tempo
    float phase = uTime * 2.0 + (pixelPos.x + pixelPos.y) * 0.3;
    float continuous = mod(phase, float(count));
    
    int idx0 = int(floor(continuous));
    int idx1 = int(mod(float(idx0 + 1), float(count))); // wrap-around
    
    float t = fract(continuous);
    // Smoothstep para transição ainda mais suave (ease in/out)
    t = t * t * (3.0 - 2.0 * t);
    
    vec3 color0 = getNthSetColor(mask, idx0);
    vec3 color1 = getNthSetColor(mask, idx1);

    vec3 lab0 = rgbToOklab(color0);
    vec3 lab1 = rgbToOklab(color1);

    return oklabToRgb(mix(lab0, lab1, t));
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


