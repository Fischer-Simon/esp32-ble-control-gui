import React, {RefObject, createRef} from "react"

import "./BleTerminal.scss"
import TerminalIcon from "../Terminal.png"
import CollapsibleCard from "./CollapsibleCard";
import {BleConnection} from "../BleConnection";

const COMMAND_HISTORY_LIMIT = 32;

type Props = {
    terminalContent: string,
    bleConnections: BleConnection[],
    onCommand: (target: string, command: string) => void,
    onVisibilityChange?: (visible: boolean) => void,
}

type State = {
    terminalVisible: boolean,
    commandHistory: string[],
    commandHistoryIndex: number,
}

export default class BleTerminal extends React.Component<Props, State> {
    private terminalElement: RefObject<HTMLPreElement>;

    constructor(props: Props) {
        super(props);
        this.state = {
            terminalVisible: false,
            commandHistory: [],
            commandHistoryIndex: -1,
        };
        this.terminalElement = createRef<HTMLPreElement>();
    }

    private terminalContentChanged() {
        const element = this.terminalElement.current!;
        element.scrollTop = element.scrollHeight;
    }

    componentDidUpdate(prevProps: Readonly<Props>, prevState: Readonly<{}>, snapshot?: any): void {
        this.terminalContentChanged();
    }

    render() {
        return <CollapsibleCard className="BleTerminal" visible={false} opensUp={true}
                                onVisibleChange={this.props.onVisibilityChange}
                                header={<img src={TerminalIcon} alt="Terminal" />}>
            <section>
                <pre ref={this.terminalElement} className="terminal">{this.props.terminalContent}</pre>
            </section>
            <footer>
                <form onSubmit={e => {
                    e.preventDefault();
                    const input = e.currentTarget.querySelector("input[type=text]");
                    const target = e.currentTarget.querySelector("select");
                    if (!(input instanceof HTMLInputElement) || !(target instanceof HTMLSelectElement) || input.value.length === 0) {
                        return;
                    }
                    if (target.value === "_all") {
                        this.props.bleConnections.forEach(ble => this.props.onCommand(ble.deviceHostname, input.value));
                    } else {
                        this.props.onCommand(target.value, input.value);
                    }
                    const commandHistory = this.state.commandHistory;
                    if (this.state.commandHistoryIndex < 0 || this.state.commandHistory[0] !== input.value) {
                        commandHistory.unshift(input.value);
                    }
                    if (commandHistory.length > COMMAND_HISTORY_LIMIT) {
                        commandHistory.pop();
                    }
                    this.setState({commandHistory, commandHistoryIndex: -1});
                    input.value = "";
                }}>
                    <label><input type="text" disabled={this.props.bleConnections.length === 0} onKeyDown={e => {
                        if (this.state.commandHistory.length === 0) {
                            return;
                        }
                        if (e.key === 'ArrowUp' && this.state.commandHistoryIndex < this.state.commandHistory.length - 1) {
                            e.currentTarget.value = this.state.commandHistory[this.state.commandHistoryIndex + 1];
                            e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length);
                            this.setState(state => {return {commandHistoryIndex: state.commandHistoryIndex + 1}});
                            e.preventDefault();
                            return;
                        }
                        if (e.key === 'ArrowDown' && this.state.commandHistoryIndex >= 0) {
                            e.currentTarget.value = this.state.commandHistoryIndex > 0 ? this.state.commandHistory[this.state.commandHistoryIndex - 1] : "";
                            e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length);
                            this.setState(state => {return {commandHistoryIndex: state.commandHistoryIndex - 1}});
                            e.preventDefault();
                            return;
                        }
                    }}/></label>
                    <select>
                        <option key="_all" value="_all">All</option>
                        {this.props.bleConnections.map(ble => <option key={ble.deviceHostname} value={ble.deviceHostname}>{ble.deviceHostname}</option>)}
                    </select>
                    <input type="submit" value="Run" disabled={this.props.bleConnections.length === 0} className="button"/>
                </form>
            </footer>
        </CollapsibleCard>
    }
}
