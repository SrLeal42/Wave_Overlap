/**
 * WebGL2 shader sources para o WFC renderer.
 * 
 * Vertex shader: fullscreen quad com UV passthrough.
 * Fragment shader: uber-shader com 4 modos visuais controlados por uMode.
 */

import { NUM_COLOR_EFFECTS } from '../constants/Output';

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

export const VIGNETTE_SHADER = `#version 300 es

precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uInputTex;
uniform float uRadius;
uniform float uSoftness;

void main() {
    vec3 color = texture(uInputTex, vUV).rgb;
    vec2 center = vUV - 0.5;
    float dist = length(center);
    float vignette = smoothstep(uRadius, uRadius - uSoftness, dist);
    fragColor = vec4(color * vignette, 1.0);
}

`;



export const SCANLINE_SHADER = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uInputTex;
uniform float uLineCount;
uniform float uOpacity;
uniform float uTime;
uniform float uSpeed;

void main() {
    vec3 color = texture(uInputTex, vUV).rgb;

    // Scroll: linhas descem com o tempo (velocidade = 0.5 ciclos/seg)
    float line = fract(vUV.y * uLineCount - uTime * uSpeed);
    float scanline = smoothstep(0.0, 0.15, line) * smoothstep(1.0, 0.85, line);

    color *= mix(1.0 - uOpacity, 1.0, scanline);

    fragColor = vec4(color, 1.0);
}

`;



export const BARREL_SHADER = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uInputTex;
uniform float uStrength;
uniform float uZoom;

void main() {
    // Centraliza em -1..1
    vec2 uv = vUV * 2.0 - 1.0;
    
    // Distância ao centro, quadrada
    float r2 = dot(uv, uv);
    
    // Barrel: pixels das bordas amostram mais perto do centro
    uv *= 1.0 + uStrength * r2;
    
    // Zoom compensatório + volta para 0..1
    uv = (uv / uZoom) * 0.5 + 0.5;
    
    // Fora dos limites → preto (bordas da curvatura)
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    fragColor = vec4(texture(uInputTex, uv).rgb, 1.0);
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

uniform int uColorEffect[32];   // Efeito per-color (0=None, 1=Pulse, ...)
uniform vec4 uFxParams[${NUM_COLOR_EFFECTS}];  // Params por efeito: [Pulse, Rotate, Wave, Breathe, Glitch, Stellar]

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


// === CAMADA 2: Per-Color Effects ===
const int FX_NONE    = 0;
const int FX_PULSE   = 1;
const int FX_ROTATE  = 2;
const int FX_WAVE    = 3;
const int FX_BREATHE = 4;
const int FX_GLITCH  = 5;
const int FX_STELLAR = 6;

vec3 applyColorEffect(vec3 color, int paletteIdx, vec2 cellPos) {
    int fx = uColorEffect[paletteIdx];
    
    if (fx == FX_NONE) return color;
    
    // Params do efeito ativo (indexado por fx-1, já que FX_NONE=0 não tem params)
    vec4 p = uFxParams[fx - 1];
    
    if (fx == FX_PULSE) {
        // p.x=speed, p.y=minBrightness, p.z=range
        float pulse = p.y + p.z * sin(uTime * p.x);
        return color * pulse;
    }
    
    if (fx == FX_ROTATE) {
        // p.x=speed, p.y=numBracos (arms), p.z=hueRange (0..1 = fração do ciclo 2π)
        vec3 lab = rgbToOklab(color);
        
        // Posição normalizada relativa ao centro da grid
        vec2 center = cellPos / uGridSize - 0.5;
        
        // Ângulo espacial (posição da célula relativa ao centro)
        float spatialAngle = atan(center.y, center.x);
        
        // Número de braços do moinho (default: 4 se p.y <= 0)
        float arms = max(p.y, 3.0);
        
        // Ângulo de rotação: combina posição angular * braços + rotação temporal
        float angle = spatialAngle * arms + uTime * p.x;
        
        // Range de variação do hue (p.z controla amplitude; default 1.0 = ciclo completo)
        float hueRange = p.z > 0.0 ? p.z : 1.0;
        float hueShift = fract(angle / 6.2831853) * 6.2831853 * hueRange;
        
        // Rotaciona os componentes a,b de OKLab pelo hue shift
        float cosA = cos(hueShift);
        float sinA = sin(hueShift);
        vec2 ab = vec2(lab.y * cosA - lab.z * sinA, lab.y * sinA + lab.z * cosA);
        
        return oklabToRgb(vec3(lab.x, ab));
    }
    
    if (fx == FX_WAVE) {
        // p.x=speed, p.y=freqX, p.z=freqY, p.w=amplitude
        float wave = sin(cellPos.x * p.y + uTime * p.x) * cos(cellPos.y * p.z + uTime * p.x * 0.67);
        vec3 lab = rgbToOklab(color);
        lab.x += wave * p.w;
        return oklabToRgb(lab);
    }
    
    if (fx == FX_BREATHE) {
        // p.x=speed, p.y=minChroma, p.z=range
        vec3 lab = rgbToOklab(color);
        float breathe = p.y + p.z * sin(uTime * p.x);
        lab.yz *= breathe;
        return oklabToRgb(lab);
    }
    
    if (fx == FX_GLITCH) {
        // p.x=speed, p.y=threshold (para block corruption)
        
        // ── Camada 1: Chromatic Aberration (base, sempre ativa, sutil) ──
        // Cada canal RGB pulsa em fase diferente, criando shimmer cromático
        float r = 0.85 + 0.15 * sin(uTime * 7.0 + cellPos.x * 0.3);
        float g = 0.85 + 0.15 * sin(uTime * 7.0 + cellPos.y * 0.3 + 2.094);
        float b = 0.85 + 0.15 * sin(uTime * 7.0 + (cellPos.x + cellPos.y) * 0.2 + 4.189);
        vec3 result = color * vec3(r, g, b);
        
        // ── Camada 2: Scan Noise (ruído granular por faixa) ──
        float scanBand = floor(cellPos.y / 2.0);
        float scanTime = floor(uTime * p.x * 5.0);
        float scanNoise = fract(sin(dot(vec2(scanBand, scanTime), vec2(78.233, 41.913))) * 43758.5453);
        
        if (scanNoise > 0.95) {
            // Noise individual por fragmento dentro da faixa afetada
            float pixelNoise = fract(sin(dot(cellPos + uTime * 17.0, vec2(12.9898, 78.233))) * 43758.5453);
            vec3 lab = rgbToOklab(result);
            // Perturba luminosidade com noise contínuo, não step binário
            lab.x *= mix(0.5, 1.2, pixelNoise);
            // Perturba chroma aleatoriamente
            lab.yz *= mix(-0.2, 1.2, fract(pixelNoise * 7.3));
            result = oklabToRgb(lab);
        }
        
        // ── Camada 3: Block Corruption (blocos com tamanho e ritmo variáveis) ──
        
        // Tamanho do bloco varia por região para quebrar a uniformidade
        float bsNoise = fract(sin(dot(floor(cellPos / 8.0), vec2(53.1, 97.3))) * 43758.5453);
        float blockSize = mix(3.0, 7.0, bsNoise);
        vec2 block = floor(cellPos / blockSize);
        
        // Cada bloco tem seu próprio "ritmo" temporal — não mudam todos juntos
        float blockRate = fract(sin(dot(block, vec2(41.7, 89.1))) * 43758.5453);
        float blockTime = floor(uTime * p.x * (1.0 + blockRate * 4.0));
        float blockNoise = fract(sin(dot(block + blockTime, vec2(127.1, 311.7))) * 43758.5453);
        
        if (blockNoise > p.y) {
            // Hashes independentes para mais variedade de cor
            float h1 = fract(sin(dot(block * 1.3 + blockTime * 0.7, vec2(269.5, 183.3))) * 43758.5453);
            float h2 = fract(sin(dot(block * 2.7 + blockTime * 1.3, vec2(419.2, 371.9))) * 43758.5453);
            
            float hue = h1 * 6.2831853;
            float chromaStrength = mix(0.05, 0.2, fract(h1 * 3.1));
            vec3 corruptLab = vec3(
                mix(0.2, 1.0, h2),
                cos(hue) * chromaStrength,
                sin(hue) * chromaStrength
            );
        
            return oklabToRgb(corruptLab);
        }
        
        return result;
    }



    if (fx == FX_STELLAR) {
        // Starfield com estrelas se movendo em direção à câmera
        // p.x=speed, p.y=density (0.1~0.5), p.z=numLayers
        
        vec2 uv = cellPos / uGridSize - 0.5; // centrado -0.5..0.5
        
        float starBright = 0.0;
        int numLayers = int(max(p.z, 3.0));
        
        for (int layer = 0; layer < 5; layer++) {
            if (layer >= numLayers) break;
            
            float fl = float(layer);
            
            // Cada camada avança em fase diferente para distribuir as estrelas
            float t = fract(uTime * p.x * 0.08 + fl * 0.25);
            
            // Zoom: começa ampliado (estrelas perto do centro), expande (estrelas nas bordas)
            // t² dá sensação de aceleração ao se aproximar
            float scale = mix(30.0, 3.0, t * t);
            vec2 scaledUV = uv * scale;
            
            // Divide o espaço em grid para posicionar estrelas
            vec2 tileCell = floor(scaledUV);
            vec2 tileUV = fract(scaledUV) - 0.5;
            
            // Hash pseudo-aleatório por célula do tile
            float hash = fract(sin(dot(tileCell + fl * 127.0, vec2(12.9898, 78.233))) * 43758.5453);
            
            // Só ~30% das células têm estrela (p.y controla densidade)
            float threshold = 1.0 - clamp(p.y, 0.1, 0.5);
            if (hash > threshold) {
                // Posição da estrela com jitter dentro da célula
                vec2 offset = vec2(
                    fract(hash * 17.3) - 0.5,
                    fract(hash * 31.7) - 0.5
                ) * 0.6;
                
                float d = length(tileUV - offset);
                
                // Tamanho cresce conforme a estrela "se aproxima"
                float size = mix(0.03, 0.09, t);
                float star = smoothstep(size, size * 0.1, d);
                
                // Fade: aparece rápido, visível por bastante tempo, desaparece no fim
                float fade = smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.85, t);
                
                // Brilho aumenta conforme "se aproxima"
                float depthBright = mix(0.3, 1.0, t);
                
                starBright += star * fade * depthBright;
            }
        }
        
        return mix(color, vec3(1.0), clamp(starBright, 0.0, 1.0));
    }
    
    return color;
}





// --- Main ---

void main() {
    ivec2 cell = ivec2(vUV * uGridSize);
    cell = clamp(cell, ivec2(0), ivec2(uGridSize) - 1);

    uint mask = texelFetch(uMaskTex, cell, 0).r;
    int count = popcount(mask);

    if (count == 0) {
        fragColor = vec4(0.04, 0.04, 0.07, 1.0);
        return;
    }

    vec3 color;
    vec2 pixelPos = vUV * uGridSize;

    if (count == 1) {
        // Colapsada — cor sólida + efeito per-color (Camada 2)
        int idx = firstSetBit(mask);
        color = uPalette[idx].rgb;
        color = applyColorEffect(color, idx, pixelPos);
    } else {
        // Não colapsada — Construction Visual (Camada 1)
        if (uMode == 0)      color = modeAvgRGB(mask, count);
        else if (uMode == 1) color = modeOklab(mask, count);
        else if (uMode == 2) color = modeDither(mask, count, pixelPos);
        else                 color = modeAnimated(mask, count, pixelPos);
    }

    fragColor = vec4(color, 1.0);
}

`;


