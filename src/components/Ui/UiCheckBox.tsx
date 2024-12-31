import {BleConnection, MetricValue} from "../../BleConnection";
import {useCallback, useEffect, useState} from "react";

export default function UiCheckBox(props: {label: string, ble: BleConnection, metricName: string, onEnableCommand: string, onDisableCommand: string, disabled?: boolean}) {
    const {label, ble, metricName, onEnableCommand, onDisableCommand, disabled} = props;

    const [value, setValue] = useState<boolean>(false);

    const onMetricChange = useCallback((metricValue: MetricValue) => {
        setValue(metricValue.toBool());
    }, []);

    useEffect(() => {
        ble.addMetricsChangeEventListener(metricName, onMetricChange);

        return () => {
            ble.removeMetricsChangeEventListener(metricName, onMetricChange);
        }
    }, [ble, metricName, onMetricChange])

    return <label><input disabled={disabled} type={"checkbox"} checked={value} onChange={e => {
        setValue(e.target.checked);
        if (e.target.checked) {
            ble.executeCommand(onEnableCommand).catch(() => {});
        }  else {
            ble.executeCommand(onDisableCommand).catch(() => {});
        }
    }}/><span className={"checkable"}>{label}</span></label>
}
