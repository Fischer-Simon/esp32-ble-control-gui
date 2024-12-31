import { useState } from 'react';
import './DebouncedSlider.scss';

type Props = {
    title: string,
    onSlide: (value: number) => void,
    color?: string,
    min?: number,
    max?: number,
    value?: number,
}

export default function DebouncedSlider(props: Props) {
    const minValue = props.min || 0;
    const maxValue = props.max || 255;
    const color = props.color || 'primary';

    const [value, setValue] = useState<number>(props.value || 0);
    const [sliderTimeout, setSliderTimeout] = useState<number>(0);

    return (
        <label className="DebouncedSlider">
            <span data-tooltip={props.title} className={`title ${color}`}></span>
            <input type="range" min={minValue} max={maxValue} value={value} onChange={e => {
            if (sliderTimeout) {
                window.clearTimeout(sliderTimeout);
            }
            setSliderTimeout(window.setTimeout(() => {
                props.onSlide(parseInt(e.target.value));
                setSliderTimeout(0);
            }, 100));
            setValue(parseInt(e.target.value));
        }}
        />
        </label>)
}
