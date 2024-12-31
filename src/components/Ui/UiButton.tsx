import {BleConnection} from "../../BleConnection";

type UiButtonConfig = {
    label: string,
    onClick: string,
}

export default function UiButton(props: {ble: BleConnection, name: string, config: UiButtonConfig}) {
    return <button onClick={() => props.ble.executeUiCommand(props.name, "", props.config.onClick)}>{props.config.label}</button>
}
