import {BleConnection, MetricValue} from "../../BleConnection";
import React, {useCallback, useEffect, useRef, useState} from "react";
import CollapsibleCard from "../CollapsibleCard";
import UiSlider from "./UiSlider";
import "./LedControl.scss"
import EspImg from "../EspImg";

type LedControlConfig = {
    ledName: string,
    icon?: string,
}

type HSLColor = {
    hue: number,
    saturation: number,
    lightness: number,
};

function colorEquals(color1: HSLColor, color2: HSLColor): boolean {
    return color1.hue === color2.hue && color1.saturation === color2.saturation && color1.lightness === color2.lightness;
}

type ColorPickerProps = {
    ble: BleConnection,
    ledName: string,
};

type ColorPickerState = {
    color: HSLColor,
    sentColor: HSLColor,
    sendingColor: boolean,
    previewVisible: { hue: boolean, saturation: boolean, lightness: boolean },
};

const hsl = (color: HSLColor) => {
    const h = color.hue * 360;
    const s = color.saturation * 100;
    const l = color.lightness * 100;
    return 'hsl(' + h + ', ' + s + '%, ' + l + '%)';
};

class ColorPicker extends React.Component<ColorPickerProps, ColorPickerState> {
    private readonly metricName: string;
    private readonly onMetricEventHandler: (value: MetricValue) => void;
    private readonly enableMetricUpdatesHandler: () => void;
    private readonly hueRef: React.RefObject<HTMLInputElement>;
    private readonly huePreviewRef: React.RefObject<HTMLInputElement>;
    private readonly saturationRef: React.RefObject<HTMLInputElement>;
    private readonly lightnessRef: React.RefObject<HTMLInputElement>;

    private metricIgnoreTimeout?: number;

    private firstClientX: number = 0;
    private firstClientY: number = 0;
    private clientX: number = 0;
    private clientY: number = 0;

    constructor(props: ColorPickerProps) {
        super(props);
        this.metricName = "LedColor/" + this.props.ledName;
        this.onMetricEventHandler = this.onMetric.bind(this);
        this.enableMetricUpdatesHandler = this.enableMetricUpdates.bind(this);
        this.hueRef = React.createRef();
        this.huePreviewRef = React.createRef();
        this.saturationRef = React.createRef();
        this.lightnessRef = React.createRef();

        this.state = {
            color: {hue: 0, saturation: 1, lightness: 0.5},
            sentColor: {hue: 0, saturation: 1, lightness: 0.5},
            sendingColor: false,
            previewVisible: {hue: false, saturation: false, lightness: false},
        };
    }

    private onMetric(value: MetricValue) {
        const color = value.toHslColor();
        this.setState({
            color,
            sentColor: color,
        });
    }

    componentDidMount() {
        // window.addEventListener('touchstart', this.touchStart);
        // window.addEventListener('touchmove', this.preventTouch, {passive: false});

        this.props.ble.addMetricsChangeEventListener(this.metricName, this.onMetricEventHandler);
    }

    componentWillUnmount() {
        // window.removeEventListener('touchstart', this.touchStart);
        // window.removeEventListener('touchmove', this.preventTouch);

        if (this.metricIgnoreTimeout) {
            clearTimeout(this.metricIgnoreTimeout);
            this.metricIgnoreTimeout = undefined;
        } else {
            this.props.ble.removeMetricsChangeEventListener(this.metricName, this.onMetricEventHandler);
        }
    }

    touchStart(e: TouchEvent) {
        this.firstClientX = e.touches[0].clientX;
        this.firstClientY = e.touches[0].clientY;
    }

    preventTouch(e: TouchEvent) {
        const minValue = 5; // threshold

        this.clientX = e.touches[0].clientX - this.firstClientX;
        this.clientY = e.touches[0].clientY - this.firstClientY;

        // Vertical scrolling does not work when you start swiping horizontally.
        if (Math.abs(this.clientX) > minValue) {
            e.preventDefault();
            return false;
        }
    }

    private disableMetricUpdates() {
        if (this.metricIgnoreTimeout !== undefined) {
            clearTimeout(this.metricIgnoreTimeout);
            this.metricIgnoreTimeout = undefined;
            return;
        }
        this.props.ble.removeMetricsChangeEventListener(this.metricName, this.onMetricEventHandler);
    }

    private enableMetricUpdates() {
        this.metricIgnoreTimeout = undefined;
        this.props.ble.addMetricsChangeEventListener(this.metricName!, this.onMetricEventHandler);
    }

    private enableMetricUpdatesDelayed() {
        clearTimeout(this.metricIgnoreTimeout);
        this.metricIgnoreTimeout = window.setTimeout(this.enableMetricUpdatesHandler, 1000);
    }

    private onChange() {
        if (this.state.sendingColor || !this.hueRef.current || !this.saturationRef.current || !this.lightnessRef.current) {
            return;
        }

        const color: HSLColor = {
            hue: parseInt(this.hueRef.current.value) * 0.001,
            saturation: parseInt(this.saturationRef.current.value) * 0.001,
            lightness: parseInt(this.lightnessRef.current.value) * 0.001
        };

        if (colorEquals(this.state.sentColor, color)) {
            return;
        }

        this.setState(state => {
            return {...state, sendingColor: true};
        });

        this.props.ble.executeCommand(`led animate "${this.props.ledName}" 0 0 150 hsl(${color.hue},${color.saturation},${color.lightness})`).then(() => {
            this.setState(state => {
                return {
                    ...state, sendingColor: false, sentColor: color
                };
            }, () => this.onChange());
        }).catch(e => {
            this.setState(state => {
                return {
                    ...state, sendingColor: false
                };
            });
        });
    };

    render() {
        const saturationGradient = `linear-gradient(to right, ${hsl({
            ...this.state.color,
            saturation: 0
        })} 0%, ${hsl({...this.state.color, saturation: 1})} 100%)`;
        const lightnessGradient = `linear-gradient(to right, ${hsl({
            ...this.state.color,
            lightness: 0
        })} 0%, ${hsl({
            ...this.state.color,
            lightness: 0.5
        })} 100%)`;
        return <div className="ColorPicker">
            <div style={{flex: "1"}}>
                <div className={`preview ${this.state.previewVisible.hue ? 'visible' : ''}`}>
                    <input readOnly={true} ref={this.huePreviewRef} type="range" className={"hue"} min={0} max={1000}
                           value={this.state.color.hue * 1000}
                           style={{
                               "--current-color": hsl(this.state.color)
                           } as React.CSSProperties}/>
                </div>
                <input type="range" className={"hue"} min={0} max={1000} value={this.state.color.hue * 1000}
                       onChange={e => {
                           const hue = parseInt(e.currentTarget.value) * 0.001;
                           this.setState(state => {
                               return {...state, color: {...state.color, hue}}
                           }, () => this.onChange());
                       }}
                       onClick={e => {
                           e.stopPropagation();
                       }}
                       onMouseDown={() => {
                           this.disableMetricUpdates();
                       }}
                       onMouseUp={() => {
                           this.enableMetricUpdatesDelayed();
                       }}
                       onTouchStart={() => {
                           this.disableMetricUpdates();
                           this.setState(state => {
                               return {...state, previewVisible: {...state.previewVisible, hue: true}};
                           });
                       }}
                       onTouchEnd={() => {
                           this.enableMetricUpdatesDelayed();
                           this.setState(state => {
                               return {...state, previewVisible: {...state.previewVisible, hue: false}};
                           });
                       }}
                       style={{
                           "--current-color": hsl(this.state.color)
                       } as React.CSSProperties}
                       ref={this.hueRef}/>
            </div>
            <button onClick={e => {
                e.stopPropagation();
                this.props.ble.executeCommand(`led animate "${this.props.ledName}" 0 0 500 primary`).catch(() => {
                });
            }} className={"tooltip-left"} data-tooltip={"Reset Color"}>↺
            </button>
            <div style={{flexBasis: "100%"}}></div>
            <input type="range" min={0} max={500} value={this.state.color.lightness * 1000}
                   onClick={e => {
                       e.stopPropagation();
                   }}
                   onMouseDown={() => {
                       this.disableMetricUpdates();
                   }}
                   onMouseUp={() => {
                       this.enableMetricUpdatesDelayed();
                   }}
                   onChange={e => {
                       const lightness = parseInt(e.currentTarget.value) * 0.001;
                       this.setState(state => {
                           return {...state, color: {...state.color, lightness}}
                       }, () => this.onChange());
                   }}
                   style={{
                       width: '50%',
                       backgroundImage: lightnessGradient,
                       "--current-color": hsl(this.state.color)
                   } as React.CSSProperties}
                   ref={this.lightnessRef}/>
            <input type="range" min={0} max={1000} value={this.state.color.saturation * 1000}
                   onClick={e => {
                       e.stopPropagation();
                   }}
                   onMouseDown={() => {
                       this.disableMetricUpdates();
                   }}
                   onMouseUp={() => {
                       this.enableMetricUpdatesDelayed();
                   }}
                   onChange={e => {
                       const saturation = parseInt(e.currentTarget.value) * 0.001;
                       this.setState(state => {
                           return {...state, color: {...state.color, saturation}}
                       }, () => this.onChange());
                   }}
                   style={
                       {
                           width: '50%',
                           backgroundImage: saturationGradient,
                           "--current-color": hsl(this.state.color)
                       } as React.CSSProperties}
                   ref={this.saturationRef}/>
        </div>

    }
}

export default function LedControl(props: {
    ble: BleConnection,
    config: LedControlConfig,
    children?: React.ReactNode
}) {
    const {ble, config} = props;

    return <div className={"LedControl"}>
        <CollapsibleCard
            header={<div className="LedControlHeader">
                {config.icon && <EspImg ble={ble} src={config.icon} style={{width: "3em", height: "3em"}}/>}
                <div style={{flex: 1}}>
                    <div style={{display: "flex", alignItems: "center", justifyItems: "right"}}>
                        <span style={{flex: "1"}}>{props.config.ledName}</span>
                    </div>
                    <ColorPicker ble={props.ble} ledName={props.config.ledName}/>
                </div>
            </div>}
            visible={false}>
            <section>
                <UiSlider ble={props.ble} name={"brightness"}
                          metricName={"LedBrightness/" + props.config.ledName}
                          config={{
                              label: "Brightness",
                              minValue: 0,
                              maxValue: 1,
                              onChange: `led set-brightness "${props.config.ledName}" {value}`,
                          }}/>
            </section>
            {props.children && <footer>
                {props.children}
            </footer>}
        </CollapsibleCard>
    </div>
}
