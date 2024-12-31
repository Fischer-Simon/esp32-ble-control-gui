import {BleConnection, BleState} from "../../BleConnection";
import React, {RefObject, useState} from "react";
import FirmwareDownloader from "./FirmwareDownloader";
import Modal from "react-modal";
import FirmwareDiffer from "./FirmwareDiffer";
import Loader, {LoaderState} from "../Loader";
import FirmwareFlasher from "./FirmwareFlasher";
import FirmwareSelfTest from "./FirmwareSelfTest";
import DataFlasher from "./DataFlasher";

type HeatshrinkDecoderPtr = number;
type SizePtr = number;
type BufferPtr = number;

export type WasmExports = {
    memory: WebAssembly.Memory,
    malloc: (size: number) => any,
    mallocSizePtr: () => SizePtr,
    free: (ptr: any) => void,
    getSize: (sizePtr: SizePtr) => number,
    heatshrink_decoder_alloc: (input_buffer_size: number, expansion_buffer_sz2: number, lookahead_sz2: number) => HeatshrinkDecoderPtr,
    heatshrink_decoder_free: (hsd: HeatshrinkDecoderPtr) => void,
    heatshrink_decoder_sink: (hsd: HeatshrinkDecoderPtr, in_buf: BufferPtr, size: number, input_size: SizePtr) => number,
    heatshrink_decoder_poll: (hsd: HeatshrinkDecoderPtr, out_buf: BufferPtr, out_buf_size: number, output_size: SizePtr) => number,
    heatshrink_decoder_finish: (hsd: HeatshrinkDecoderPtr) => number,
    generate_patch: (oldData: BufferPtr, oldSize: number, newData: BufferPtr, newSize: number, patchData: BufferPtr, patchDataCapacity: number, rawDiffSize: SizePtr) => number,
    compress_data: (data: BufferPtr, size: number, compressedData: BufferPtr, compressedDataCapacity: number) => number,
}

export enum HeatshrinkStatus {
    HSDR_EMPTY = 0,
    HSDR_MORE = 1,
}

const FIRMWARE_PARTITION_SIZE = 0x1D0000;
const DATA_PARTITION_SIZE = 0x40000;

enum UpdateType {
    Firmware,
    Data,
}

enum UpdateState {
    Idle,
    LoadNewFirmware,
    RecoveryReboot,
    DownloadCurrentFirmware,
    GenerateFirmwareDiff,
    FlashFirmware,
    SelfTest,
    Success,
    Error,
}

type Props = {
    ble: BleConnection,
    wasm: WasmExports,
    onClose: () => void,
};

type State = {
    updateState: UpdateState,
    updateType: UpdateType,
    lastSuccessfulState: UpdateState,
    errorCode?: string,
    hasFile: boolean,
    newFirmware: Uint8Array | null,
    currentFirmware: Uint8Array | null,
    patch: Uint8Array | null,
    rawPatchSize: number,
}

class BleOtaWasm extends React.Component<Props, State> {
    private readonly ble: BleConnection;

    private readonly fileInput: RefObject<HTMLInputElement>;

    constructor(props: Props) {
        super(props);
        this.ble = props.ble;
        this.fileInput = React.createRef<HTMLInputElement>();
        this.state = {
            updateState: UpdateState.Idle,
            updateType: UpdateType.Firmware,
            lastSuccessfulState: UpdateState.Idle,
            hasFile: false,
            newFirmware: null,
            currentFirmware: null,
            patch: null,
            rawPatchSize: 0,
        };
    }

    private setErrorState(errorCode: number | string | undefined = undefined) {
        this.setState(state => {
            if (state.updateState === UpdateState.Error) {
                return {
                    updateState: state.updateState,
                    lastSuccessfulState: state.lastSuccessfulState,
                    errorCode: state.errorCode
                };
            }
            return {
                updateState: UpdateState.Error,
                lastSuccessfulState: state.updateState,
                errorCode: errorCode?.toString()
            };
        });
    }

    private async resetEsp() {
        let gotDisconnect = false;
        await this.props.ble.executeCommand("reset 0").catch(reason => gotDisconnect = reason === "Disconnect");
        if (!gotDisconnect) {
            throw Error("ESP reset failed");
        }
        return this.props.ble.start();
    }

    private startFirmwareUpdate() {
        if (this.fileInput.current === null || this.fileInput.current.files === null || this.fileInput.current.files.length === 0) {
            this.setState({updateState: UpdateState.Error});
            return;
        }
        this.setState({updateState: UpdateState.LoadNewFirmware});
        const fileReader = new FileReader();
        fileReader.onload = async () => {
            const newFirmware = new Uint8Array(fileReader.result as ArrayBuffer);
            if (newFirmware[0] === 0xE9) {
                this.setState({
                    updateType: UpdateType.Firmware,
                    updateState: UpdateState.RecoveryReboot,
                });

                if (!this.props.ble.runningRecoveryMode) {
                    await this.props.ble.executeCommand("firmware request-recovery");
                    await this.resetEsp();
                }

                this.setState({
                    updateType: UpdateType.Firmware,
                    updateState: UpdateState.DownloadCurrentFirmware,
                    newFirmware,
                });
            } else if (newFirmware.byteLength === DATA_PARTITION_SIZE && (new TextDecoder()).decode(newFirmware).indexOf("littlefs") > 0) {
                this.setState({
                    updateType: UpdateType.Data,
                    updateState: UpdateState.RecoveryReboot,
                });

                if (!this.props.ble.runningRecoveryMode) {
                    await this.props.ble.executeCommand("firmware request-recovery");
                    await this.resetEsp();
                }
                this.setState({
                    updateType: UpdateType.Data,
                    updateState: UpdateState.FlashFirmware,
                    newFirmware
                });
            } else {
                this.setErrorState("Invalid firmware file");
            }
        };
        if (this.fileInput.current.files[0].size <= Math.max(DATA_PARTITION_SIZE, FIRMWARE_PARTITION_SIZE)) {
            fileReader.readAsArrayBuffer(this.fileInput.current.files[0]);
        } else {
            this.setErrorState("Invalid firmware file");
        }
    }

    private generateFirmwareDiff(currentFirmware: Uint8Array) {
        if (this.state.newFirmware === null) {
            this.setState({updateState: UpdateState.Error});
            return;
        }
        this.setState({updateState: UpdateState.GenerateFirmwareDiff, currentFirmware});
    }

    private prepareFirmwareFlash(patch: Uint8Array, rawPatchSize: number) {
        if (this.state.newFirmware === null || this.state.currentFirmware === null) {
            this.setState({updateState: UpdateState.Error});
            return;
        }

        this.setState({
            patch: patch,
            rawPatchSize: rawPatchSize,
            updateState: UpdateState.FlashFirmware,
        });
    }

    private getLoaderState(updateState: UpdateState) {
        if (this.state.updateState === UpdateState.Error) {
            return LoaderState.Error;
        }
        if (this.state.updateState < updateState) {
            return LoaderState.Pending;
        }
        if (this.state.updateState === updateState) {
            return LoaderState.Normal;
        }
        if (this.state.updateState > updateState) {
            return LoaderState.Success;
        }
    }

    private renderFirmware() {
        let activeStepElement = <></>;

        switch (this.state.updateState) {
            case UpdateState.DownloadCurrentFirmware:
                activeStepElement = <FirmwareDownloader
                    ble={this.ble}
                    wasm={this.props.wasm}
                    onFinish={data => this.generateFirmwareDiff(data)}
                    onError={() => this.setErrorState()}
                />
                break;
            case UpdateState.GenerateFirmwareDiff:
                if (this.state.currentFirmware === null || this.state.newFirmware === null) {
                    this.setErrorState();
                    return;
                }
                activeStepElement = <FirmwareDiffer
                    wasm={this.props.wasm}
                    oldFirmware={this.state.currentFirmware}
                    newFirmware={this.state.newFirmware}
                    onFinish={(diff, rawDiffSize) => {
                        this.prepareFirmwareFlash(diff, rawDiffSize);
                    }}
                    onError={errorCode => this.setErrorState(errorCode)}
                />
                break;
            case UpdateState.FlashFirmware:
                if (this.state.currentFirmware === null || this.state.newFirmware === null || this.state.patch === null) {
                    this.setErrorState();
                    return;
                }
                activeStepElement = <FirmwareFlasher
                    ble={this.ble}
                    oldFirmware={this.state.currentFirmware}
                    newFirmware={this.state.newFirmware}
                    patch={this.state.patch}
                    rawPatchSize={this.state.rawPatchSize}
                    onFinish={() => this.setState({updateState: UpdateState.SelfTest})}
                    onError={msg => this.setErrorState(msg)}/>
                break;
            case UpdateState.SelfTest:
                if (this.state.newFirmware === null) {
                    this.setErrorState();
                    return;
                }
                activeStepElement = <FirmwareSelfTest
                    ble={this.ble}
                    newFirmware={this.state.newFirmware}
                    onFinish={() => this.setState({updateState: UpdateState.Success})}
                    onError={msg => this.setErrorState(msg)}/>
                break;
            case UpdateState.Success:
                activeStepElement = <button
                    className="success"
                    onClick={() => this.props.onClose()}>
                    Close
                </button>
                break;
            case UpdateState.Error:
                activeStepElement = <div>
                    <div style={{float: "left"}}>
                        An error occurred during update:<br/>
                        {UpdateState[this.state.lastSuccessfulState]}: {this.state.errorCode ?? "Unknown"}
                    </div>
                    <button style={{float: "right", marginLeft: "1em"}}
                            onClick={() => this.setState({updateState: UpdateState.Idle})}>Restart
                    </button>
                </div>
                break;
        }

        return <div>
            <h3>
                <Loader spaceRight={true} state={this.getLoaderState(UpdateState.RecoveryReboot)}/>
                Reboot into Recovery
            </h3>
            <h3>
                <Loader spaceRight={true} state={this.getLoaderState(UpdateState.DownloadCurrentFirmware)}/>
                Download running Firmware
            </h3>
            <h3>
                <Loader spaceRight={true} state={this.getLoaderState(UpdateState.GenerateFirmwareDiff)}/>
                Generate Firmware diff
            </h3>
            <h3>
                <Loader spaceRight={true} state={this.getLoaderState(UpdateState.FlashFirmware)}/>
                Flash new Firmware
            </h3>
            <h3>
                <Loader spaceRight={true} state={this.getLoaderState(UpdateState.SelfTest)}/>
                Validate new Firmware
            </h3>
            <hr/>
            {activeStepElement}
        </div>
    }

    private renderData() {
        let activeStepElement = <></>;

        switch (this.state.updateState) {
            case UpdateState.FlashFirmware:
                if (this.state.newFirmware === null) {
                    this.setErrorState();
                    return;
                }
                activeStepElement = <DataFlasher
                    ble={this.ble}
                    wasm={this.props.wasm}
                    newData={this.state.newFirmware}
                    onFinish={() => this.setState({updateState: UpdateState.Success})}
                    onError={msg => this.setErrorState(msg)}/>
                break;
            case UpdateState.Success:
                activeStepElement = <button
                    className="success"
                    onClick={() => this.props.onClose()}>
                    Close
                </button>
                break;
            case UpdateState.Error:
                activeStepElement = <div>
                    <div style={{float: "left"}}>
                        An error occurred during update:<br/>
                        {UpdateState[this.state.lastSuccessfulState]}: {this.state.errorCode ?? "Unknown"}
                    </div>
                    <button style={{float: "right", marginLeft: "1em"}}
                            onClick={() => this.setState({updateState: UpdateState.Idle})}>Restart
                    </button>
                </div>
                break;
        }

        return <div>
            <h3>
                <Loader spaceRight={true} state={this.getLoaderState(UpdateState.RecoveryReboot)}/>
                Reboot into Recovery
            </h3>
            <h3>
                <Loader spaceRight={true} state={this.getLoaderState(UpdateState.FlashFirmware)}/>
                Flash new Data
            </h3>
            <hr/>
            {activeStepElement}
        </div>
    }

    render() {
        if (this.state.updateState === UpdateState.Idle) {
            return <div>
                <input ref={this.fileInput} type="file"
                       onChange={e => this.setState({hasFile: (e.currentTarget.files?.length ?? 0) > 0})}/>
                <button style={{float: "right"}} disabled={!this.state.hasFile}
                        onClick={() => this.startFirmwareUpdate()}>Update
                </button>
            </div>
        } else if (this.state.updateState === UpdateState.LoadNewFirmware) {
            return <div><Loader/> Loading...</div>
        } else if (this.state.updateType === UpdateType.Data) {
            return this.renderData();
        }
        return this.renderFirmware();
    }
}

const customStyles = {
    content: {
        top: '50%',
        left: '50%',
        right: 'auto',
        bottom: 'auto',
        marginRight: '-50%',
        transform: 'translate(-50%, -50%)',
    },
};

export default function BleOta(props: { ble: BleConnection }) {
    const [wasmExports, setWasmExports] = useState<WasmExports>();
    const [updaterIsOpen, setUpdaterIsOpen] = useState<boolean>(false);

    if (!updaterIsOpen && props.ble.state !== BleState.Connected) {
        return <></>
    }

    return <span>
        <button onClick={async e => {
            e.stopPropagation();
            if (wasmExports === undefined) {
                const memory = new WebAssembly.Memory({initial: 256, maximum: 256});
                const imports = {
                    js: {mem: memory},
                    wasi_snapshot_preview1: {
                        fd_close: () => {
                        },
                        fd_write: () => {
                        },
                        fd_seek: () => {
                        },
                    }
                };
                const instance = await WebAssembly.instantiateStreaming(fetch("lib.wasm"), imports);
                setWasmExports(instance.instance.exports as WasmExports);
            }
            setUpdaterIsOpen(true);
        }}>🔧</button>
        {(updaterIsOpen && wasmExports) ?
            <Modal isOpen={updaterIsOpen} style={customStyles}>
                <h2>
                    Firmware Updater
                    <button className="error modal-close" onClick={() => setUpdaterIsOpen(false)}>X</button>
                </h2>
                <BleOtaWasm ble={props.ble} wasm={wasmExports} onClose={() => setUpdaterIsOpen(false)}/>
            </Modal> : <></>}
    </span>
}
