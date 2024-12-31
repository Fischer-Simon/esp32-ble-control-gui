/* eslint-disable react-hooks/exhaustive-deps */
import {BleConnection} from "../../BleConnection";
import {useEffect, useState} from "react";
import {getFirmwareHash, putFirmwareToLocalCache} from "./FirmwareDownloader";
import Loader from "../Loader";
import {WasmExports} from "./BleOta";

type Props = {
    ble: BleConnection,
    wasm: WasmExports,
    newData: Uint8Array,
    onFinish: () => void,
    onError: (msg: string) => void,
}

export default function DataFlasher(props: Props) {
    const [bytesFlashed, setBytesFlashed] = useState<number>(0);

    const {
        ble,
        wasm,
        newData,
        onFinish,
        onError
    } = props;

    useEffect(() => {
        const resetEsp = async () => {
            let gotDisconnect = false;
            await ble.executeCommand("reset 0").catch(reason => gotDisconnect = reason === "Disconnect");
            if (!gotDisconnect) {
                throw Error("ESP reset failed");
            }
            await ble.start();
        }

        const flashData = async () => {
            let statusBuffer = "";
            let success = false;

            const dataPtr = wasm.malloc(newData.byteLength);
            const data = new Uint8Array(wasm.memory.buffer, dataPtr, newData.byteLength);
            data.set(newData);

            const compressedDataCapacity = newData.byteLength + 1024;
            const compressedDataPtr = wasm.malloc(compressedDataCapacity);

            const compressedDataSize = wasm.compress_data(dataPtr, data.byteLength, compressedDataPtr, compressedDataCapacity);
            if (compressedDataSize <= 0) {
                wasm.free(dataPtr);
                wasm.free(compressedDataPtr);
                onError(`Compression failed with ${compressedDataSize}`);
                return;
            }

            const compressedData = Uint8Array.from(new Uint8Array(wasm.memory.buffer, compressedDataPtr, compressedDataSize));

            wasm.free(dataPtr);
            wasm.free(compressedDataPtr);

            const args = `${compressedData.byteLength} ${newData.byteLength}`;
            await ble.executeCommand(`firmware flash-data ${args}`, compressedData, data => {
                statusBuffer += ble.decodeText(data);
                let newLinePos = statusBuffer.indexOf("\n")
                while (newLinePos >= 0) {
                    const statusLine = statusBuffer.substring(0, newLinePos);
                    statusBuffer = statusBuffer.substring(newLinePos + 1);

                    console.log(statusLine);

                    try {
                        const status = JSON.parse(statusLine);
                        if ("error" in status) {
                            onError(status["error"] as string);
                        }
                        if ("success" in status) {
                            success = true;
                        }
                        if ("progress" in status) {
                            setBytesFlashed(status["progress"] as number);
                        }
                    } catch (e) {
                        onError(statusLine);
                    }

                    newLinePos = statusBuffer.indexOf("\n")
                }
            }).catch(e => {
                onError(e instanceof Error ? e.message : "Unknown Command Error");
            })
            if (!success) {
                onError("Unknown");
                return;
            }
            await resetEsp();
            onFinish();
        };
        flashData();
    }, []);

    if (bytesFlashed > 0) {
        return <div className="progress">
            <div style={{width: (100 * bytesFlashed / props.newData.byteLength) + "%"}}/>
        </div>
    }
    return <h3><Loader/> Preparing...</h3>
}
