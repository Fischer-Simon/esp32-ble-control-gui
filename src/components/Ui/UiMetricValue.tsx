import {BleConnection, MetricValue} from "../../BleConnection";
import React from "react";

type UiMetricLabelConfig = {
    label: string,
    metricName: string,
}

type Props = {
    ble: BleConnection,
    name: string,
    config: UiMetricLabelConfig,
};

type State = {
    value: number,
};

export default class UiMetricValue extends React.Component<Props, State> {
    private readonly onMetricEventHandler: (value: MetricValue) => void;

    constructor(props: Props) {
        super(props);
        this.onMetricEventHandler = this.onMetric.bind(this);

        this.state = {
            value: 0,
        };
    }

    private onMetric(metricValue: MetricValue) {
        const value = metricValue.toFloat();
        this.setState({
            value,
        });
    }

    componentDidMount() {
        this.props.ble.addMetricsChangeEventListener(this.props.config.metricName, this.onMetricEventHandler);
    }

    componentWillUnmount() {
        this.props.ble.removeMetricsChangeEventListener(this.props.config.metricName, this.onMetricEventHandler);
    }

    render() {
        return <span>{this.props.config.label} {this.state.value}</span>
    }
}
