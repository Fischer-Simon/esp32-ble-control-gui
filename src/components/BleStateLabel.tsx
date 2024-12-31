import {BleConnection, BleState as State} from "../BleConnection";
import React from "react";

export default function BleStateLabel(props: {ble: BleConnection}) {
    switch (props.ble.state) {
        case State.Disabled:
            return <span className="label nomargin">Disconnected</span>;
        case State.RequestingDevice:
            return <span className="label nomargin info">Scanning</span>;
        case State.Connecting:
            return <span className="label nomargin info">Connecting</span>;
        case State.ConnectedFetchingInfos:
            return <span className="label nomargin info">Loading</span>;
        case State.Connected:
            return <span className="label nomargin success">
                Connected
                {props.ble.runningRecoveryMode ? <span className="label info">Recovery</span> : <></>}
                {props.ble.busy ? '⇅' : ''}
            </span>;
        case State.Reconnecting:
            return <span className="label nomargin info">Reconnecting</span>;
        case State.Disconnected:
            return <span className="label nomargin warning">Disconnected</span>;
        case State.Error:
            return <span className="label nomargin error">Error: {props.ble.stateMessage.toString()}</span>;
    }
}
