import { useState } from 'react';
import '../styles/HintTip.css';

interface HintTipProps {
    text: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

export function HintTip({ text, position = 'top' }: HintTipProps) {
    const [visible, setVisible] = useState(false);

    return (
        <span
            className="hint-tip"
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            <span className="hint-tip-icon">?</span>
            {visible && (
                <span className={`hint-tip-bubble hint-tip-${position}`}>
                    {text}
                </span>
            )}
        </span>
    );
}
