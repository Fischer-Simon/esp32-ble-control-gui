import {BleConnection, MetricValue} from "../../BleConnection";
import React from "react";

type UiSliderConfig = {
    label: string,
    onChange: string,
    minValue: number,
    maxValue: number,
}

type Props = {
    ble: BleConnection,
    name: string,
    metricName?: string,
    config: UiSliderConfig,
    actionButtons?: React.ReactNode,
};

type State = {
    metricIgnoreTimeout: number | null,
    value: number,
    sentValue: number,
    sendingValue: boolean,
};

export default class UiSlider extends React.Component<Props, State> {
    private readonly minValue: number;
    private readonly maxValue: number;
    private readonly valueMultiplier: number;
    private readonly onMetricEventHandler: (value: MetricValue) => void;
    private readonly inputRef: React.RefObject<HTMLInputElement>;

    private firstClientX: number = 0;
    private firstClientY: number = 0;
    private clientX: number = 0;
    private clientY: number = 0;

    constructor(props: Props) {
        super(props);
        this.minValue = props.config.minValue;
        this.maxValue = props.config.maxValue
        this.valueMultiplier = 1;

        if (this.minValue === 0 && this.maxValue === 1) {
            // Special case for uniform distribution sliders since Android does not support sliders with a fractional step size.
            this.maxValue = 1000;
            this.valueMultiplier = 0.001;
        }

        this.onMetricEventHandler = this.onMetric.bind(this);
        this.inputRef = React.createRef();

        this.state = {
            metricIgnoreTimeout: null,
            value: 0,
            sentValue: 0,
            sendingValue: false,
        };
    }

    private onMetric(metricValue: MetricValue) {
        const value = metricValue.toFloat() / this.valueMultiplier;
        this.setState({
            value,
            sentValue: value,
        });
    }

    componentDidMount() {
        // window.addEventListener('touchstart', this.touchStart);
        // window.addEventListener('touchmove', this.preventTouch, {passive: false});

        if (this.props.metricName) {
            this.props.ble.addMetricsChangeEventListener(this.props.metricName, this.onMetricEventHandler);
        }
    }

    componentWillUnmount() {
        // window.removeEventListener('touchstart', this.touchStart);
        // window.removeEventListener('touchmove', this.preventTouch);

        if (this.props.metricName) {
            if (this.state.metricIgnoreTimeout) {
                clearTimeout(this.state.metricIgnoreTimeout);
            } else {
                this.props.ble.removeMetricsChangeEventListener(this.props.metricName, this.onMetricEventHandler);
            }
        }
    }

    touchStart(e: TouchEvent){
        this.firstClientX = e.touches[0].clientX;
        this.firstClientY = e.touches[0].clientY;
    }

    preventTouch(e: TouchEvent){
        const minValue = 5; // threshold

        this.clientX = e.touches[0].clientX - this.firstClientX;
        this.clientY = e.touches[0].clientY - this.firstClientY;

        // Vertical scrolling does not work when you start swiping horizontally.
        if(Math.abs(this.clientX) > minValue){
            e.preventDefault();
            return false;
        }
    }

    private delayMetricUpdate() {
        if (!this.props.metricName) {
            return;
        }
        if (this.state.metricIgnoreTimeout !== null) {
            clearTimeout(this.state.metricIgnoreTimeout);
        } else {
            this.props.ble.removeMetricsChangeEventListener(this.props.metricName, this.onMetricEventHandler);
        }
        this.setState(state => {
            const metricIgnoreTimeout = window.setTimeout(() => {
                this.setState(state => {
                    return {...state, metricIgnoreTimeout: null};
                });
                this.props.ble.addMetricsChangeEventListener(this.props.metricName!, this.onMetricEventHandler);
            }, 1000);
            return {
                ...state,
                metricIgnoreTimeout,
            };
        });
    }

    private onChange() {
        this.delayMetricUpdate();

        if (this.state.sendingValue || !this.inputRef.current) {
            return;
        }

        const resultValue = parseInt(this.inputRef.current.value) * this.valueMultiplier;

        if (this.state.sentValue === resultValue) {
            return;
        }

        this.setState(state => {
            return {...state, sendingValue: true};
        });
        this.props.ble.executeUiCommand(this.props.name, resultValue.toString(), this.props.config.onChange).then(() => {
            this.setState(state => {
                return {
                    ...state, sendingValue: false, sentValue: resultValue
                };
            }, () => this.onChange());
        }).catch(e => {
            this.setState(state => {
                return {
                    ...state, sendingValue: false
                };
            });
        });
    };

    render() {
        return <label className="DebouncedSlider">
            <div>{this.props.config.label}{this.props.actionButtons ? <div style={{float: "right"}}>{this.props.actionButtons}</div> : <></>}</div>
            <input type="range" ref={this.inputRef} min={this.minValue} max={this.maxValue} value={this.state.value}
                   onClick={e => e.stopPropagation()}
                   onChange={e => {
                       this.setState(state => {
                           if (!this.inputRef.current) {
                               return;
                           }
                           return {
                               ...state,
                               value: parseInt(this.inputRef.current.value)
                           };
                       });
                       this.onChange();
                   }}
            />
        </label>
    }
}
