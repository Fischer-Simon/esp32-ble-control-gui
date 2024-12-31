import React from 'react';
import 'picnic/src/picnic.scss';
import './App.scss';
import {BleConnection, BleState, UiElementJson} from './BleConnection';
import UiButton from "./components/Ui/UiButton";
import UiSlider from "./components/Ui/UiSlider";
import Loader from "./components/Loader";
import LedControl from "./components/Ui/LedControl";
import CollapsibleCard from "./components/CollapsibleCard";
import BleStateLabel from "./components/BleStateLabel";
import BleOta from "./components/BleOta/BleOta";
import ModelSettings from "./components/ModelSettings";
import EspImg from "./components/EspImg";
import UiCheckBox from "./components/Ui/UiCheckBox";
import UiMetricValue from "./components/Ui/UiMetricValue";

type Props = {
    ble: BleConnection
};


type State = {
    bleState: BleState,
    bleBusy: boolean,
    errorMessage?: string,
    settingsVisible?: boolean,
}

export default class ModelControl extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            bleState: this.props.ble.state,
            bleBusy: false,
        };
    }

    componentDidMount() {
        this.props.ble.onStatusChange = (bleState: BleState) => {
            this.setState({bleState});
        };
        this.props.ble.onActivityChange = (bleBusy: boolean) => {
            this.setState({bleBusy});
        };
    }

    private renderUiElements(elements?: UiElementJson[]) {
        if (!elements) {
            return <></>;
        }
        return elements.map(element => {
                switch (element.type) {
                    case "FlexGroup":
                        return <div>
                            {/*{element.config && element.config.title && <h3>{element.config.title}</h3>}*/}
                            <div key={element.name} style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                justifyItems: "center",
                                columnGap: "0.5rem"
                            }}>
                                {this.renderUiElements(element.children)}
                            </div>
                        </div>;
                    case "Button":
                        return <div key={element.name} style={element.style}>
                            <UiButton name={element.name}
                                      ble={this.props.ble}
                                      config={element.config}/>
                        </div>
                    case "Slider":
                        return <div key={element.name} style={element.style}>
                            <UiSlider name={element.name} ble={this.props.ble}
                                      config={element.config}/>
                        </div>
                    case "LedControl":
                        return <div key={element.name} style={element.style}>
                            <LedControl ble={this.props.ble} config={element.config}>
                                {this.renderUiElements(element.children)}
                            </LedControl>
                        </div>
                    case "MetricValue":
                        return <div key={element.name} style={element.style}>
                            <UiMetricValue ble={this.props.ble} name={element.name} config={element.config} />
                        </div>
                    default:
                        return <div key={element.name}>Unknown UI element type {element.type}</div>
                }
            }
        );
    }

    private renderHeader() {
        return <div style={{display: "flex", alignItems: "center", justifyContent: "right", columnGap: "1rem", flexWrap: "wrap"}}>
            <EspImg ble={this.props.ble} src={"/data/share/model.png"}/>
            <div style={{flex: "1"}}>
                {this.props.ble.deviceHostname}<br/>
                <BleStateLabel ble={this.props.ble}/>
            </div>
            <div style={{display: "flex", flexDirection: "column"}}>
                <div style={{display: "flex", columnGap: "0.5rem"}}>
                    <button disabled={this.state.bleState !== BleState.Connected} onClick={e => {
                        e.stopPropagation();
                        this.setState({settingsVisible: true});
                    }}>⚙️
                    </button>
                    <BleOta ble={this.props.ble}/>
                    <button disabled={this.state.bleState !== BleState.Connected} onClick={e => {
                        e.stopPropagation();
                        this.props.ble.executeCommand("led startup-animation").catch(() => {
                        });
                    }} className={"tooltip-left"} data-tooltip={"Reset Colors to Default"}>↺🎨
                    </button>
                </div>
                <div>
                    <UiCheckBox disabled={this.state.bleState !== BleState.Connected} label={"Manual Control"} ble={this.props.ble} metricName={"Settings/ManualMode"}
                                onEnableCommand={"led manual on"} onDisableCommand={"led manual off"}/>
                </div>
            </div>
        </div>
    }

    private renderHeaderRecovery() {
        return <div style={{display: "flex", alignItems: "center", columnGap: "1rem", flexWrap: "wrap"}}>
            <div style={{flex: "1"}}>
                {this.props.ble.deviceHostname}<br/>
                <BleStateLabel ble={this.props.ble}/>
            </div>
            <BleOta ble={this.props.ble}/>
        </div>
    }

    private renderHeaderNotConnected() {
        return <div style={{display: "flex", alignItems: "center", columnGap: "1rem", flexWrap: "wrap"}}>
            <div style={{flex: "1"}}>
                {this.props.ble.deviceHostname}<br/>
                <BleStateLabel ble={this.props.ble}/>
            </div>
        </div>
    }

    private renderContent() {
        switch (this.state.bleState) {
            case BleState.Disabled:
            case BleState.Error:
            case BleState.Disconnected:
                return <button onClick={() => {
                    this.props.ble.start().catch(() => {
                        this.setState({bleState: BleState.Error});
                    });
                }}>Reconnect</button>;
            case BleState.Connecting:
                return <h2 style={{textAlign: "center"}}><Loader/> Connecting...</h2>;
            case BleState.ConnectedFetchingInfos:
                return <h2 style={{textAlign: "center"}}><Loader/> Loading...</h2>;
            case BleState.Connected:
                if (this.props.ble.runningRecoveryMode) {
                    return <div>
                        <h3><span className="label warning">Recovery Mode</span></h3>
                        <p>The controller is running in limited recovery mode most likely due to a previous crash or
                            running firmware update.</p>
                        <button onClick={async () => {
                            await this.props.ble.executeCommand("core-dump");
                            await this.props.ble.executeCommand("reset 0").catch(() => this.props.ble.start());
                        }}>Remove Core Dump and Reset
                        </button>
                    </div>
                }
                return this.renderUiElements(this.props.ble.uiElements);
        }
    }

    render() {
        const header = this.renderHeader();

        return (
            <CollapsibleCard className="noborder" header={header} visible={true}>
                <footer>
                    {this.renderContent()}
                    <div style={{float: "right"}}>
                    </div>
                </footer>
                <ModelSettings isOpen={this.state.settingsVisible ?? false} ble={this.props.ble}
                               onClose={() => this.setState({settingsVisible: false})}/>
            </CollapsibleCard>
        );
    }
}
