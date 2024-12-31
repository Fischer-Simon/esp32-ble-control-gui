import { useState } from 'react';
import DebouncedSlider from './DebouncedSlider';
import './LedStringControl.scss';
import CollapsibleCard from './CollapsibleCard';

export type LedStringAnimation = {
  color: string | {
    r: number,
    g: number,
    b: number,
    w: number,
  },
  pixelDelay: number,
  duration: number,
};

export type LedString = {
  name: string,
  description: string,
  exposedToGui: boolean,
  configuration: Map<string, string>,
};

type LedStringControlProps = {
  ledString: LedString,
  onAnimate: (ledString: LedString, animation: LedStringAnimation) => void,
}

export default function LedStringControl(props: LedStringControlProps) {
  type SliderColor = {
    r: number,
    g: number,
    b: number,
    w: number
  };
  const [sliderColor, setSliderColor] = useState<SliderColor>({
    r: 0, g: 0, b: 0, w: 0
  });

  const onPrimarySlide = (value: number) => {
    props.onAnimate(props.ledString, {
      color: `primary,${value}`,
      pixelDelay: 0,
      duration: 100,
    });
  }

  const onColorSlide = (value: number, channelStr: string) => {
    const channel = channelStr as keyof SliderColor;
    const color = {
      ...sliderColor,
      [channel]: value
    };
    setSliderColor(color);
    props.onAnimate(props.ledString, {
      color: `[${color.r},${color.g},${color.b},${color.w}]`,
      pixelDelay: 0,
      duration: 100,
    });
  }

  return <CollapsibleCard header={props.ledString.description}>
    <section>
      <DebouncedSlider title="Primary" onSlide={onPrimarySlide} />
      <DebouncedSlider title="Red" color="red" onSlide={value => onColorSlide(value, 'r')} />
      <DebouncedSlider title="Green" color="green" onSlide={value => onColorSlide(value, 'g')} />
      <DebouncedSlider title="Blue" color="blue" onSlide={value => onColorSlide(value, 'b')} />
      <DebouncedSlider title="White" color="white" onSlide={value => onColorSlide(value, 'w')} />
    </section>
    <footer>
      <button className="button success" onClick={() => props.onAnimate(props.ledString, { color: 'primary,100', pixelDelay: 0, duration: 400 })}>On</button>
      <button className="button warning" onClick={() => props.onAnimate(props.ledString, { color: 'off', pixelDelay: 0, duration: 400 })}>Off</button>
    </footer>
  </CollapsibleCard>;
}
