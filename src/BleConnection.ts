import React from "react";

export enum BleState {
    Disabled,
    RequestingDevice,
    Connecting,
    ConnectedFetchingInfos,
    Connected,
    Reconnecting,
    Disconnected,
    Error,
}

enum FirmwareState {
    New,
    RecoveryTestPending,
    RecoveryTest,
    RecoveryRequest,
    Stable,
}

const TRANSMISSION_SIZE = 222;
const MAX_BYTES_IN_TRANSMISSION = TRANSMISSION_SIZE * 4;
const SERVICE_UUID = "afc3eba8-ba5e-42be-8d3c-94c7fe325ba1";
const RX_CHARACTERISTIC_UUID = "f72bac71-f66f-4cce-b83f-a4218f482707";
const TX_CHARACTERISTIC_UUID = "f72bac71-f66f-4cce-b83f-a4218f482706";
const TX_ACK_CHARACTERISTIC_UUID = "f72bac71-f66f-4cce-b83f-a4218f482708";
const UI_CHARACTERISTIC_UUID = "f72bac71-f66f-4cce-b83f-a4218f482709";
const NOP_FN = () => {
};

export type UiElementJson = {
    name: string,
    type: string,
    config: any,
    style?: React.CSSProperties,
    children?: UiElementJson[],
}

type Command = {
    request: ArrayBuffer | undefined,
    startTime: number,
    response: Uint8Array,
    onData: ((data: Uint8Array) => void) | null,
    onResolve?: (response: string) => void,
    onResolveBinary?: (response: Uint8Array) => void,
    onReject: (reason: string) => void,
};

export class MetricValue {
    private dataView: DataView;

    constructor(dataView: DataView, byteOffset: number, valueSize: number) {
        this.dataView = new DataView(dataView.buffer.slice(byteOffset, byteOffset + valueSize));
    }

    toBool(): boolean {
        return this.dataView.getUint8(0) > 0;
    }

    toInt(): number {
        return this.dataView.getInt32(0, true);
    }

    toFloat(): number {
        return this.dataView.getFloat32(0, true);
    }

    toHslColor(): { hue: number, saturation: number, lightness: number } {
        const hue = this.dataView.getFloat32(0, true);
        const saturation = this.dataView.getFloat32(4, true);
        const lightness = this.dataView.getFloat32(8, true);
        return {hue, saturation, lightness};
    }
}

export class BleConnection {
    private _onStateChange: (state: BleState) => void;

    private _onActivityChange: (transmissionActive: boolean) => void;

    private _onDataReceived: (data: string) => void;

    private _state: BleState = BleState.Disabled;

    private _stateMessage: string = "";

    private readonly onDisconnectEventHandler: () => void;

    private readonly onRxEventHandler: () => void;

    private readonly onTxAckEventHandler: () => void;

    private readonly onMetricsEventHandler: () => void;

    private bytesInTransmission: number = 0;

    private waitingForTxAck: boolean = false;

    private commandQueue: Command[];

    private activeCommand: Command | undefined;

    private lastConnectedDevice: BluetoothDevice | undefined;

    private device: BluetoothDevice | undefined;

    private server: BluetoothRemoteGATTServer | undefined;

    private rxCharacteristic: BluetoothRemoteGATTCharacteristic | undefined;

    private txCharacteristic: BluetoothRemoteGATTCharacteristic | undefined;

    private txAckCharacteristic: BluetoothRemoteGATTCharacteristic | undefined;

    private metricsCharacteristic: BluetoothRemoteGATTCharacteristic | undefined;

    private _deviceHostname?: string;

    private _uiElements: UiElementJson[];

    private _uiState: Map<string, string>;

    private firmwareState: FirmwareState;

    private currentMetrics: Map<string, MetricValue>;

    private onMetricsChange: Map<string, Set<((value: MetricValue) => void)>>;

    private textEncoder: TextEncoder;

    private textDecoder: TextDecoder;

    constructor(onDataReceived: (data: string) => void) {
        this._onStateChange = NOP_FN;
        this._onActivityChange = NOP_FN;
        this._onDataReceived = onDataReceived;
        this.onDisconnectEventHandler = this.disconnect.bind(this);
        this.onRxEventHandler = this.onRx.bind(this);
        this.onTxAckEventHandler = this.onTxAck.bind(this);
        this.onMetricsEventHandler = this.onMetricChange.bind(this);
        this.commandQueue = [];
        this._uiElements = [];
        this._uiState = new Map();
        this.firmwareState = FirmwareState.New;
        this.currentMetrics = new Map();
        this.onMetricsChange = new Map();
        this.textEncoder = new TextEncoder();
        this.textDecoder = new TextDecoder();
    }

    set onStatusChange(value: (state: BleState) => void) {
        this._onStateChange = value;
    }

    set onActivityChange(value: (transmissionActive: boolean) => void) {
        this._onActivityChange = value;
    }

    public get busy() {
        return this.activeCommand !== undefined;
    }

    public get state() {
        return this._state;
    }

    public get stateMessage() {
        return this._stateMessage;
    }

    public get uiElements() {
        return this._uiElements;
    }

    public get deviceHostname(): string {
        return this._deviceHostname ?? "";
    }

    public get runningRecoveryMode(): boolean {
        return [FirmwareState.RecoveryRequest, FirmwareState.RecoveryTest].indexOf(this.firmwareState) >= 0;
    }

    private set state(state: BleState) {
        this._onStateChange(state);
        this._state = state;
    }

    static supported(): boolean {
        return "bluetooth" in navigator;
    }

    private debug(_: any) {
        // console.debug(_);
    }

    remoteDeviceId(): string {
        return this.device?.id ?? "unknown";
    }

    disconnect(error?: string | Event) {
        console.log(error);
        this.device?.removeEventListener("gattserverdisconnected", this.onDisconnectEventHandler);
        this.server?.disconnect();
        this.rxCharacteristic?.removeEventListener("characteristicvaluechanged", this.onRxEventHandler);
        this.txAckCharacteristic?.removeEventListener("characteristicvaluechanged", this.onTxAckEventHandler);
        this.metricsCharacteristic?.removeEventListener("characteristicvaluechanged", this.onMetricsEventHandler);

        if (this.activeCommand) {
            this.activeCommand.onReject("Disconnect");
            this.activeCommand = undefined;
        }

        while (this.commandQueue.length > 0) {
            this.commandQueue.pop()?.onReject("Disconnect");
        }

        this.waitingForTxAck = false;
        this.bytesInTransmission = 0;
        this.lastConnectedDevice = this.device;
        this.device = undefined;
        this.server = undefined;
        this.rxCharacteristic = undefined;
        this.txCharacteristic = undefined;
        this.txAckCharacteristic = undefined;
        this.metricsCharacteristic = undefined;
        this._uiElements = [];
        this._uiState = new Map();
        this.firmwareState = FirmwareState.New;
        this.currentMetrics = new Map();

        if (error === undefined) {
            this.state = BleState.Disconnected;
        } else if (error instanceof Event && error.type === "gattserverdisconnected") {
            this._stateMessage = "";
            this.state = BleState.Disconnected;
        } else {
            this._stateMessage = error.toString();
            this.state = BleState.Error;
            this.lastConnectedDevice = undefined;
        }
    }

    private onRx() {
        if (!this.rxCharacteristic?.value) {
            return;
        }

        this.debug(`Got ${this.rxCharacteristic.value.byteLength} Bytes ${this.activeCommand !== undefined ? '1' : '0'}`)

        // A zero byte write indicates the ESP32 finished processing the command.
        if (this.rxCharacteristic.value.byteLength === 0) {
            if (this.activeCommand !== undefined) {
                const commandDuration = performance.now() - this.activeCommand.startTime;
                console.log(`Command took ${commandDuration.toLocaleString(undefined, {maximumFractionDigits: 2})} ms with ${this.activeCommand.response.byteLength} Bytes response size and ${(this.activeCommand.response.byteLength / (commandDuration / 1000)).toLocaleString(undefined, {maximumFractionDigits: 2})} Byte/s`)

                if (this.activeCommand.onData === null) {
                    if (this.activeCommand.onResolve) {
                        const data = this.textDecoder.decode(this.activeCommand.response);
                        this._onDataReceived(data);
                        this.activeCommand.onResolve(data);
                    } else if (this.activeCommand.onResolveBinary) {
                        this.activeCommand.onResolveBinary(this.activeCommand.response);
                    }
                } else {
                    if (this.activeCommand.onResolve) {
                        this.activeCommand.onResolve("");
                    } else if (this.activeCommand.onResolveBinary) {
                        this.activeCommand.onResolveBinary(new Uint8Array(0));
                    }
                }
                this.activeCommand = undefined;
                this._onActivityChange(false);
            } else {
                console.warn("Got command end but no command active");
            }

            const nextCommand = this.commandQueue.shift();
            if (nextCommand) {
                this.handleCommand(nextCommand);
            }

            return;
        }

        if (this.activeCommand !== undefined) {
            const receivedData = new Uint8Array(this.rxCharacteristic.value.buffer);
            const newResponse = new Uint8Array(this.activeCommand.response.byteLength + this.rxCharacteristic.value.byteLength);
            newResponse.set(this.activeCommand.response);
            newResponse.set(receivedData, this.activeCommand.response.byteLength);
            this.activeCommand.response = newResponse;
            if (this.activeCommand.onData) {
                this.activeCommand.onData(receivedData);
            }
        } else {
            const data = this.textDecoder.decode(this.rxCharacteristic.value);
            this._onDataReceived(data);
        }
    }

    private onTxAck() {
        if (!this.txAckCharacteristic?.value) {
            return;
        }

        const ackSize = this.txAckCharacteristic.value.getUint16(0, true); // true here represents little-endian
        this.bytesInTransmission -= ackSize;

        this.debug(`Got ack size ${ackSize}`);

        if (this.waitingForTxAck) {
            this.waitingForTxAck = false;
            this.handleCommandData();
        }
    }

    private onMetricChange() {
        if (!this.metricsCharacteristic?.value) {
            return;
        }

        this.handleMetrics(new DataView(this.metricsCharacteristic.value.buffer));
    }

    private handleMetrics(dataView: DataView, overwriteExisting: boolean = true) {
        let offset = 0;

        while (offset < dataView.byteLength) {
            let metricName = "";
            while (dataView.getUint8(offset) !== 0) {
                metricName += String.fromCharCode(dataView.getUint8(offset));
                offset++;
            }
            offset++;

            const valueSize = dataView.getUint8(offset++);
            const value = new MetricValue(dataView, offset, valueSize);
            if (overwriteExisting || !this.currentMetrics.has(metricName)) {
                this.currentMetrics.set(metricName, value);
                if (this.onMetricsChange.has(metricName)) {
                    this.onMetricsChange.get(metricName)?.forEach(cb => cb(value));
                }
            }
            offset += valueSize;
        }
    }

    private handleCommandData() {
        if (this.activeCommand === undefined) {
            return;

        }
        if (!this.txCharacteristic) {
            this.activeCommand.onReject("Not connected");
            this.activeCommand = undefined;
            return;
        }

        if (this.activeCommand.request === undefined) {
            // // Signal end of data
            // this.txCharacteristic.writeValue(new Uint8Array(0))
            //     .catch(e => {
            //         this.activeCommand?.onReject(e);
            //         this.debug('reject')
            //         this.activeCommand = undefined;
            //     });
            return;
        }

        const sendSize = Math.min(TRANSMISSION_SIZE, this.activeCommand.request.byteLength);
        const sendData = this.activeCommand.request.slice(0, sendSize);
        if (sendSize < this.activeCommand.request.byteLength) {
            this.activeCommand.request = this.activeCommand.request.slice(sendSize);
        } else {
            this.activeCommand.request = undefined;
        }
        this.bytesInTransmission += sendSize;
        this.txCharacteristic.writeValueWithoutResponse(sendData)
            .then(() => {
                if (this.bytesInTransmission < MAX_BYTES_IN_TRANSMISSION) {
                    this.handleCommandData()
                } else {
                    this.waitingForTxAck = true;
                    this.debug("Wait for TX ack");
                }
            })
            .catch(e => {
                this.activeCommand?.onReject(e);
                this.activeCommand = undefined;
            })
        this.debug(`Writing ${sendSize}(${sendData.byteLength}) bytes, ${this.activeCommand.request?.byteLength} left, ${this.bytesInTransmission} in transmission`);
    }

    private handleCommand(command: Command) {
        if (this.activeCommand !== undefined) {
            throw new Error("Command already active");
        }

        if (!this.txCharacteristic) {
            command.onReject("Not connected");
            return;
        }
        this._onActivityChange(true);
        this.activeCommand = command;
        this.activeCommand.startTime = performance.now();
        this.handleCommandData();
    }

    getMetric(metric: string): MetricValue {
        if (!this.currentMetrics.has(metric)) {
            return new MetricValue(new DataView(new Uint8Array()), 0, 0);
        }
        return this.currentMetrics.get(metric)!;
    }

    addMetricsChangeEventListener(metric: string, cb: (value: any) => void) {
        if (!this.onMetricsChange.has(metric)) {
            this.onMetricsChange.set(metric, new Set());
        }
        this.onMetricsChange.get(metric)?.add(cb);
        if (this.currentMetrics.has(metric)) {
            setTimeout(() => cb(this.currentMetrics.get(metric)), 0);
        }
    }

    removeMetricsChangeEventListener(metric: string, cb: (value: any) => void) {
        if (!this.onMetricsChange.has(metric)) {
            console.log("Metric not found");
            return;
        }
        if (!this.onMetricsChange.get(metric)?.delete(cb)) {
            console.log("Listener not found");
        }
    }

    decodeText(data: Uint8Array) {
        return this.textDecoder.decode(data);
    }

    executeUiCommand(key: string, value: string, command: string) {
        this._uiState.set(key, value);

        const matches = command.matchAll(/{([0-9a-z_-]+)}/g);
        let sourcePos = 0;
        let parsedCommand = "";
        for (const match of matches) {
            parsedCommand += command.substring(sourcePos, match.index) + "\"" + (this._uiState.get(match[1] === "value" ? key : match[1]) ?? "").replace("\"", "\\\"") + "\"";
            sourcePos = (match.index ?? 0) + match[0].length;
        }
        parsedCommand += command.substring(sourcePos);
        // this.uiCharacteristic?.writeValueWithoutResponse(new Uint8Array(this.textEncoder.encode(key + "=" + value)));
        return this.executeCommand(parsedCommand);
    }

    executeCommand(
        command: string,
        data: ArrayBuffer | null = null,
        onDataReceived: ((data: Uint8Array) => void) | null = null
    ): Promise<string> {
        this._onDataReceived("+" + command + "\n");
        const commandData = this.textEncoder.encode(command + "\n");
        const request = new Uint8Array(commandData.length + (data?.byteLength ?? 0))
        request.set(commandData, 0);
        if (data !== null) {
            request.set(new Uint8Array(data), commandData.length);
        }

        let commandObj: Command = {
            request,
            startTime: performance.now(),
            response: new Uint8Array(),
            onData: onDataReceived,
            onResolve: NOP_FN,
            onReject: NOP_FN,
        };

        const promise = new Promise<string>((resolve, reject) => {
            commandObj.onResolve = resolve;
            commandObj.onReject = reject;
        });

        if (this.activeCommand === undefined) {
            this.handleCommand(commandObj);
        } else {
            this.commandQueue.push(commandObj);
        }

        return promise;
    }

    executeCommandBinaryResult(
        command: string
    ): Promise<Uint8Array> {
        this._onDataReceived("+" + command + "\n");
        const request = this.textEncoder.encode(command + "\n");

        let commandObj: Command = {
            request,
            startTime: performance.now(),
            response: new Uint8Array(),
            onData: null,
            onResolveBinary: NOP_FN,
            onReject: NOP_FN,
        };

        const promise = new Promise<Uint8Array>((resolve, reject) => {
            commandObj.onResolveBinary = resolve;
            commandObj.onReject = reject;
        });

        if (this.activeCommand === undefined) {
            this.handleCommand(commandObj);
        } else {
            this.commandQueue.push(commandObj);
        }

        return promise;
    }

    private async setCharacteristicsFrom(service: BluetoothRemoteGATTService | undefined) {
        const characteristics = await service?.getCharacteristics();

        if (characteristics === undefined) {
            throw Error("No characteristics found");
        }

        for (let i = 0; i < characteristics.length; i++) {
            const characteristic = characteristics[i];
            if (characteristic.uuid === RX_CHARACTERISTIC_UUID) {
                this.rxCharacteristic = characteristic;
            }
            if (characteristic.uuid === TX_CHARACTERISTIC_UUID) {
                this.txCharacteristic = characteristic;
            }
            if (characteristic.uuid === TX_ACK_CHARACTERISTIC_UUID) {
                this.txAckCharacteristic = characteristic;
            }
            if (characteristic.uuid === UI_CHARACTERISTIC_UUID) {
                this.metricsCharacteristic = characteristic;
            }
        }
    }

    private async connect(device: BluetoothDevice) {
        this.disconnect();
        this.state = BleState.Connecting;
        this.device = device;
        this._deviceHostname = device.name;
        device.addEventListener("gattserverdisconnected", this.onDisconnectEventHandler);
        this.server = await device.gatt?.connect();
        await this.setCharacteristicsFrom(await this.server?.getPrimaryService(SERVICE_UUID));
        if (this.rxCharacteristic === undefined || this.txCharacteristic === undefined || this.txAckCharacteristic === undefined) {
            this.disconnect("RX or TX characteristic not found");
            return;
        }

        // stopNotifications has to be called otherwise notifications stop working after a reconnect.
        await this.rxCharacteristic.stopNotifications();
        await this.rxCharacteristic.startNotifications();
        await this.txAckCharacteristic.stopNotifications();
        await this.txAckCharacteristic.startNotifications();
        await this.metricsCharacteristic?.stopNotifications();
        await this.metricsCharacteristic?.startNotifications();
        this.rxCharacteristic.addEventListener("characteristicvaluechanged", this.onRxEventHandler);
        this.txAckCharacteristic.addEventListener("characteristicvaluechanged", this.onTxAckEventHandler);
        this.metricsCharacteristic?.addEventListener("characteristicvaluechanged", this.onMetricsEventHandler);
        this.state = BleState.ConnectedFetchingInfos;

        const firmwareInfoStr = await this.executeCommand("firmware info");
        if (!firmwareInfoStr.startsWith("{")) {
            this.disconnect(firmwareInfoStr);
            return;
        }
        const firmwareInfo = JSON.parse(firmwareInfoStr);
        this.firmwareState = firmwareInfo["state"] as FirmwareState;
        if (!this.runningRecoveryMode) {
            const configJson = await this.executeCommand("fs cat /data/etc/ui.json");
            if (configJson.startsWith("[")) {
                this._uiElements = JSON.parse(configJson);
            }
            const metricData = await this.executeCommandBinaryResult("metrics");
            this.handleMetrics(new DataView(metricData.buffer));
        }
        this.state = BleState.Connected;
    }

    async start() {
        this.state = BleState.RequestingDevice;
        // navigator.bluetooth.addEventListener("advertisementreceived", e => {
        //     console.log(e);
        // });
        // return navigator.bluetooth.requestLEScan({acceptAllAdvertisements: true, keepRepeatedDevices: true});
        let device = this.lastConnectedDevice ? this.lastConnectedDevice : await navigator.bluetooth.requestDevice({
            filters: [{
                services: [SERVICE_UUID]
            }]
        });
        let attempts = 4;
        while (true) {
            try {
                await this.connect(device);
                return;
            } catch (e) {
                attempts--;
                if (attempts > 0) {
                    await new Promise(r => setTimeout(r, 400));
                } else {
                    this.disconnect(e instanceof Error ? e.message : "Unknown");
                    return;
                }
            }
        }
    }
}
