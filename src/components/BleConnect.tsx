import "./BleConnect.scss"

type BleConnectProps = {
    onConnectClick: () => void
}

export default function BleConnect(props: BleConnectProps) {
    return <div className="BleConnect">
        <button onClick={props.onConnectClick}>Connect</button>
    </div>
}
