import React from 'react';
import 'picnic/src/picnic.scss';
import './App.scss';
import Modal from 'react-modal';
import {BleConnection, BleState} from './BleConnection';
import BleConnect from './components/BleConnect';
import BleTerminal from './components/BleTerminal';
import BleStateLabel from "./components/BleStateLabel";
import UiButton from "./components/Ui/UiButton";
import UiSlider from "./components/Ui/UiSlider";
import BleOta from "./components/BleOta/BleOta";
import Loader from "./components/Loader";
import LedControl from "./components/Ui/LedControl";
import ModelControl from "./ModelControl";

type Props = {};

type State = {
    terminalVisible: boolean,
    terminalContent: string,
    modelConnections: BleConnection[],
}

Modal.setAppElement("#root");

class App extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            terminalVisible: false,
            terminalContent: "Terminal\n",
            modelConnections: [],
        };
    }

    private appendTerminalContent(content: string) {
        this.setState({terminalContent: this.state.terminalContent + content});
    }

    private onTerminalCommand(target: string, command: string) {
        const ble = this.state.modelConnections.find(ble => ble.deviceHostname === target)
        if (!ble) {
            return;
        }
        this.appendTerminalContent("> " + command + "\n");
        ble.executeCommand(command).catch(e => this.appendTerminalContent(e + "\n"));
    }

    private broadcast(command: string) {
        for (let i = 0; i < this.state.modelConnections.length; i++) {
            this.state.modelConnections[i].executeCommand(command).catch(() => {});
        }
    }

    private async addConnection() {
        const ble = new BleConnection(
            (data: string) => this.appendTerminalContent(data)
        );
        this.setState(state => {
            state.modelConnections.unshift(ble);
            return state;
        })
        await ble.start().catch(e => {
            this.setState(state => {
                state.modelConnections.splice(state.modelConnections.indexOf(ble));
                return state;
            })
        });
    }

    render() {
        if (!BleConnection.supported()) {
            return (<div className='label error'>Web Bluetooth not supported</div>);
        }

        return (
            <div className={`App ${this.state.terminalVisible ? "terminal" : ""}`}>
                <nav>
                    <a href="/" className="brand" onClick={e => e.preventDefault()}>
                        <span>ESP32 BLE Control</span>
                    </a>
                </nav>
                <main>
                    <div>
                        <button onClick={() => this.addConnection()}>Add Connection</button>
                    </div>
                    {this.state.modelConnections.map((ble: BleConnection) => (
                        <ModelControl key={ble.remoteDeviceId()} ble={ble}/>
                    ))}
                    <div>
                        <button
                            onClick={() => this.broadcast("led animate-3d All global 0,0,8 0 10 [500,700] 0 primary 2 add easeInOutSine;led animate-3d All global 0,0,0 500 10 [500,2500] 0 off;led animate-3d All 0,0,0 global 2000 [200,220] [800,4000] 0 green 1 blend easeInOutSine")}>Assimilate
                        </button>
                        <button
                            onClick={() => this.broadcast("js run 'import {warpFlash} from \"/data/lib/animation.js\"; warpFlash()'")}>Warp
                            All
                        </button>
                        <button
                            onClick={() => this.broadcast("led animate All 0 0 800 primary")}>Reset All
                        </button>
                    </div>
                </main>
                <BleTerminal bleConnections={this.state.modelConnections}
                             terminalContent={this.state.terminalContent}
                             onVisibilityChange={terminalVisible => this.setState({terminalVisible})}
                             onCommand={(target, command) => this.onTerminalCommand(target, command)}/>
            </div>
        );
    }
}

export default App;
