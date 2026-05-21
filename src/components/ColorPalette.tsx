import type { ColorPaletteProps } from "../types/Grid";

export function ColorPalette({ palette, selectedIndex, onSelect }: ColorPaletteProps) {
    return (
        <div className="color-palette">
            {palette.map((color) => (
                <button
                    key={color.index}
                    className={`palette-swatch ${selectedIndex === color.index ? 'selected' : ''}`}
                    style={{ backgroundColor: color.hex }}
                    onClick={() => onSelect(color.index)}
                    title={color.label}
                    aria-label={`Select color: ${color.label}`}
                />
            ))}
        </div>
    );
}
