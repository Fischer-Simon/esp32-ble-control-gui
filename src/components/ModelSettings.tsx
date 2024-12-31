import {BleConnection} from "../BleConnection";
import ReactModal from "react-modal";
import React, {useEffect} from "react";
import Loader from "./Loader";
import BleOta from "./BleOta/BleOta";
import UiCheckBox from "./Ui/UiCheckBox";

const modalStyles = {
    content: {
        top: '50%',
        left: '50%',
        right: 'auto',
        bottom: 'auto',
        marginRight: '-50%',
        transform: 'translate(-50%, -50%)',
    },
};

export default function ModelSettings(props: { isOpen: boolean, ble: BleConnection, onClose: () => void }) {
    const {isOpen, ble} = props;

    const [isLoading, setLoading] = React.useState(true);
    const [xValue, setXValue] = React.useState(0);
    const [yValue, setYValue] = React.useState(0);
    const [zValue, setZValue] = React.useState(0);
    const [angleValue, setAngleValue] = React.useState(0);

    const xInput = React.useRef<HTMLInputElement>(null);
    const yInput = React.useRef<HTMLInputElement>(null);
    const zInput = React.useRef<HTMLInputElement>(null);
    const angleInput = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen || ble.runningRecoveryMode) {
            return;
        }
        ble.executeCommand("led get-pos").then(data => {
            const pos = JSON.parse(data);
            setXValue(pos.x);
            setYValue(pos.y);
            setZValue(pos.z);
            setAngleValue(pos.a);
            setLoading(false);
        })
    }, [isOpen, ble]);

    return <ReactModal isOpen={props.isOpen} style={modalStyles}>
        <h2>
            Settings
            <button className="error modal-close" onClick={props.onClose}>X</button>
        </h2>
        <h3>Animation Behaviour</h3>
        <UiCheckBox label={"Manual Control on Startup"} ble={ble} metricName={"Settings/StartManual"}
                    onEnableCommand={"led manual on save"}
                    onDisableCommand={"led manual off save"}/><br/>
        <UiCheckBox label={"Enable startup Animations"} ble={ble}
                    metricName={"Settings/StartAnimOn"}
                    onEnableCommand={"led startup-animation on"}
                    onDisableCommand={"led startup-animation off"}/>
        <hr />
        <h3>Model Position</h3>
        <form>
            <div style={{display: "flex", columnGap: "1em"}}>
                <label>X: <input disabled={isLoading} type={"number"} ref={xInput} value={xValue}
                                 onChange={e => setXValue(parseFloat(e.currentTarget.value ?? '0'))}/></label>
                <label>Y: <input disabled={isLoading} type={"number"} ref={yInput} value={yValue}
                                 onChange={e => setYValue(parseFloat(e.currentTarget.value ?? '0'))}/></label>
                <label>Z: <input disabled={isLoading} type={"number"} ref={zInput} value={zValue}
                                 onChange={e => setZValue(parseFloat(e.currentTarget.value ?? '0'))}/></label>
            </div>
            <label>Angle: <input disabled={isLoading} type={"number"} ref={angleInput} value={angleValue}
                                 onChange={e => setAngleValue(parseFloat(e.currentTarget.value ?? '0'))}/></label>
            <div style={{textAlign: "right"}}>
                <button disabled={isLoading} onClick={e => {
                    e.preventDefault();
                    if (!xInput.current || !yInput.current || !zInput.current || !angleInput.current) {
                        return;
                    }
                    ble.executeCommand(`led set-pos ${xInput.current.value},${yInput.current.value},${zInput.current.value} ${angleInput.current.value}`).then(() => {
                        setLoading(true);
                        props.onClose();
                    });
                }}>Save Model Position
                </button>
            </div>
        </form>
        <hr/>
    </ReactModal>
}
