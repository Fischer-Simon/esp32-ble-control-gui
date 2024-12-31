import React from "react";
import { BleConnection } from "../BleConnection";
import CodeMirror from '@uiw/react-codemirror';

type Props = {
    ble: BleConnection,
}

type State = {
    files: string[],
    fileName: string,
    code: string,
    busy: boolean,
}

export default class LuaEditor extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            files: [],
            fileName: '',
            code: '',
            busy: false,
        }
    }

    componentDidMount(): void {
        this.setState({busy: true});
        this.props.ble.executeCommand('fs ls /data/lua')
            .then(result => {
                this.setState({ files: result.split(' ').filter(file => file.trim().length > 0), busy: false });
            })
    }

    render() {
        return (<div>
            {this.state.files.map(fileName => <button className={this.state.fileName == fileName ? 'success' : ''} key={fileName} onClick={() => {
                this.setState({busy: true});
                this.props.ble.executeCommand(`fs cat /data/lua/${fileName}`)
                .then(code => this.setState({code, fileName, busy: false}));
            }}>{fileName}</button>)}
            <CodeMirror
                value={this.state.code}
                onChange={value => this.setState({ code: value })}
                height='600px'
                basicSetup={{tabSize: 4}} />
            <button className="button success" disabled={this.state.busy} onClick={() => {
                console.log("saving file");
                this.setState({busy: true});
                const textEncoder = new TextEncoder();
                const data = textEncoder.encode(this.state.code);
                this.props.ble.executeCommand(`fs write /data/lua/${this.state.fileName} ${data.byteLength}`, data)
                .then(() => this.setState({busy: false}));
             }}>Save</button><button onClick={() => this.props.ble.executeCommand('lua load /data/lua/main.lua')}>Restart</button>
        </div>);
    }
}
